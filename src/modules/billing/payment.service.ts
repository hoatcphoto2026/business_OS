import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { PaymentProvider, PaymentStatus } from './enums/payment.enum';
import { MockGateway } from './gateways/mock.gateway';
import { VietQRGateway } from './gateways/vietqr.gateway';
import { PayOSGateway } from './gateways/payos.gateway';
import { CreatePaymentDto, RefundDto, WebhookDto } from './dto/payment.dto';
import { BankingWebhookDto } from './dto/banking-webhook.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { assertUniqueMatch } from './payment-lookup.util';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';

const MAX_RETRIES = 3;

@Injectable()
export class PaymentService {
  /**
   * Find a unique pending transaction by providerRef.
   * Rejects if multiple tenants share the same ref (prevents cross-tenant confirmation).
   */
  private async findUniquePendingByRef(providerRef: string, amount?: number): Promise<any | null> {
    const matches = await this.txns.find({
      where: { providerRef, status: PaymentStatus.PENDING },
    });
    const txn = assertUniqueMatch(matches, 'payment reference');
    if (!txn) return null;
    if (amount !== undefined && Math.abs(parseFloat(txn.amount) - amount) > 1) {
      this.logger.warn(`Amount mismatch for ${providerRef}`);
      return null;
    }
    return txn;
  }

  private requireWebhookSecret(envKey: string, fallback: string): string {
    const secret = process.env[envKey];
    const isProd = process.env.NODE_ENV === 'production';
    if (!secret || (isProd && secret === fallback)) {
      if (isProd) {
        throw new BadRequestException(`Webhook secret ${envKey} must be set in production`);
      }
    }
    return secret || fallback;
  }

  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly txns: Repository<PaymentTransaction>,
    @InjectRepository(PaymentMethod)
    private readonly methods: Repository<PaymentMethod>,
    private readonly gateway: MockGateway,
    private readonly vietqr: VietQRGateway,
    private readonly payos: PayOSGateway,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new BadRequestException('Tenant context required');
    return tid;
  }

  async create(dto: CreatePaymentDto): Promise<PaymentTransaction> {
    const tenantId = this.getTenantId();

    // Idempotency check
    const existing = await this.txns.findOne({ where: { idempotencyKey: dto.idempotencyKey, tenantId: this.getTenantId() } });
    if (existing) {
      this.logger.debug(`Idempotent hit: ${dto.idempotencyKey}`);
      return existing;
    }

    const txn = this.txns.create({
      tenantId,
      invoiceId: dto.invoiceId ?? null,
      provider: dto.provider,
      status: PaymentStatus.PENDING,
      amount: dto.amount.toFixed(2),
      currency: dto.currency ?? 'VND',
      idempotencyKey: dto.idempotencyKey,
      createdBy: this.safeUserId(),
    });
    const saved = await this.txns.save(txn);

    // Route to the right gateway
    let gw: { createPayment: (i: any) => Promise<any> } = this.gateway;
    if (dto.provider === PaymentProvider.VIETQR || dto.provider === PaymentProvider.BANKING) {
      gw = this.vietqr;
    } else if (dto.provider === PaymentProvider.PAYOS) {
      gw = this.payos;
    }

    const result = await gw.createPayment({
      amount: dto.amount,
      currency: dto.currency ?? 'VND',
      idempotencyKey: dto.idempotencyKey,
      invoiceId: dto.invoiceId,
    });

    saved.status = result.status;
    saved.externalId = result.externalId ?? null;
    saved.providerRef = result.providerRef ?? null;
    saved.failureReason = result.failureReason ?? null;
    saved.processedAt = result.status === PaymentStatus.SUCCESS ? new Date() : null;
    try {
      const et = result.status === PaymentStatus.SUCCESS ? EventType.InvoicePaid : EventType.PaymentFailed;
      await this.eventBus.publish(et, 'payment', saved.id, {
        amount: saved.amount,
        status: result.status,
      });
    } catch (e: any) {
      this.logger.warn('Payment event skipped: ' + e.message);
    }

    // Attach QR URL for VietQR
    if (dto.provider === PaymentProvider.VIETQR || dto.provider === PaymentProvider.BANKING) {
      saved.metadata = {
        qrUrl: this.vietqr.buildQrUrl(dto.amount, result.providerRef ?? ''),
        content: result.providerRef,
      };
    }

    const final = await this.txns.save(saved);

    await this.safeAudit('PaymentTransaction', final.id, AuditAction.CREATE, {
      newData: { status: final.status, amount: final.amount, provider: final.provider },
    });

    return final;
  }

  private async processWithRetry(txn: PaymentTransaction, attempt = 1): Promise<{
    status: PaymentStatus;
    externalId?: string;
    providerRef?: string;
    failureReason?: string;
  }> {
    try {
      txn.status = PaymentStatus.PROCESSING;
      await this.txns.save(txn);
      return await this.gateway.createPayment({
        amount: parseFloat(txn.amount),
        currency: txn.currency,
        idempotencyKey: txn.idempotencyKey,
        invoiceId: txn.invoiceId ?? undefined,
      });
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        txn.retryCount = attempt;
        await this.txns.save(txn);
        this.logger.warn(`Retry ${attempt} for ${txn.id}`);
        return this.processWithRetry(txn, attempt + 1);
      }
      return { status: PaymentStatus.FAILED, failureReason: String(e) };
    }
  }

  async refund(dto: RefundDto): Promise<PaymentTransaction> {
    const tenantId = this.getTenantId();
    const txn = await this.txns.findOne({ where: { id: dto.transactionId, tenantId } });
    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    const amount = dto.amount ?? parseFloat(txn.amount);
    const result = await this.gateway.refund(txn.externalId ?? '', amount);
    txn.status = result.status;
    txn.updatedBy = this.safeUserId();
    const saved = await this.txns.save(txn);

    await this.safeAudit('PaymentTransaction', saved.id, AuditAction.UPDATE, {
      newData: { status: 'REFUNDED', amount },
    });
    return saved;
  }

  /**
   * Banking webhook – called when a bank transfer matching a VietQR content arrives.
   * Matches by providerRef (transfer content) and amount.
   */
  async handleBankingWebhook(dto: BankingWebhookDto): Promise<{ ok: boolean; matched: boolean }> {
    const secret = this.requireWebhookSecret('BANKING_WEBHOOK_SECRET', 'bank-secret');
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', secret).update(`${dto.content}|${dto.amount}`).digest('hex');
    const ok = dto.signature === expected || (process.env.NODE_ENV !== 'production' && dto.signature === secret);
    if (!ok) {
      throw new BadRequestException('Invalid banking webhook signature');
    }

    const txn = await this.findUniquePendingByRef(dto.content, dto.amount);
    if (!txn) {
      this.logger.warn(`No unique pending txn for content: ${dto.content}`);
      return { ok: true, matched: false };
    }

    txn.status = PaymentStatus.SUCCESS;
    txn.externalId = dto.bankTxnId ?? txn.externalId;
    txn.processedAt = new Date();
    await this.txns.save(txn);

    await this.safeAudit('PaymentTransaction', txn.id, AuditAction.UPDATE, {
      newData: { status: 'SUCCESS', source: 'banking-webhook', bankTxnId: dto.bankTxnId },
    });

    return { ok: true, matched: true };
  }

  async handleWebhook(dto: WebhookDto): Promise<{ ok: boolean }> {
    const secret = this.requireWebhookSecret('PAYMENT_WEBHOOK_SECRET', 'test-secret');
    const valid = this.gateway.verifySignature(
      { provider: dto.provider, externalId: dto.externalId, status: dto.status as PaymentStatus, signature: dto.signature },
      secret,
    );
    if (!valid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const matches = await this.txns.find({ where: { externalId: dto.externalId } });
    const txn = assertUniqueMatch(matches, 'external id');
    if (!txn) {
      this.logger.warn(`Webhook for unknown externalId: ${dto.externalId}`);
      return { ok: true };
    }

    txn.status = dto.status as PaymentStatus;
    txn.processedAt = new Date();
    await this.txns.save(txn);

    await this.safeAudit('PaymentTransaction', txn.id, AuditAction.UPDATE, {
      newData: { status: txn.status, source: 'webhook' },
    });
    return { ok: true };
  }

  private safeUserId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId() || null;
    } catch {
      return null;
    }
  }

  private async safeAudit(
    entity: string,
    id: string,
    action: AuditAction,
    payload: { newData?: Record<string, unknown> },
  ) {
    try {
      await this.audit.logAction(entity, id, action, payload);
    } catch {
      this.logger.warn('Audit skipped');
    }
  }
}
