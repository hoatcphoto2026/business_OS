import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingInvoice } from './entities/billing-invoice.entity';
import { BillingInvoiceItem } from './entities/billing-invoice-item.entity';
import { Coupon } from './entities/coupon.entity';
import { Subscription } from './entities/subscription.entity';
import { Plan } from './entities/plan.entity';
import { InvoiceStatus } from './enums/invoice-status.enum';
import { BillingCycle } from './enums/billing.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(BillingInvoice)
    private readonly invoices: Repository<BillingInvoice>,
    @InjectRepository(BillingInvoiceItem)
    private readonly items: Repository<BillingInvoiceItem>,
    @InjectRepository(Coupon)
    private readonly coupons: Repository<Coupon>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new BadRequestException('Tenant context required');
    return tid;
  }

  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.invoices.count();
    return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async list(): Promise<BillingInvoice[]> {
    const tenantId = this.getTenantId();
    return this.invoices.find({
      where: { tenantId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string): Promise<BillingInvoice> {
    const tenantId = this.getTenantId();
    const inv = await this.invoices.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  async generate(dto: GenerateInvoiceDto = {}): Promise<BillingInvoice> {
    const tenantId = this.getTenantId();
    const userId = this.safeUserId();

    const sub = dto.subscriptionId
      ? await this.subscriptions.findOne({ where: { id: dto.subscriptionId, tenantId }, relations: ['plan'] })
      : await this.subscriptions.findOne({ where: { tenantId }, relations: ['plan'], order: { createdAt: 'DESC' } });

    if (!sub) throw new NotFoundException('No subscription found');

    const plan = sub.plan ?? (await this.plans.findOne({ where: { id: sub.planId } }));
    if (!plan) throw new NotFoundException('Plan not found');

    const unitPrice = parseFloat(
      sub.billingCycle === BillingCycle.YEARLY ? plan.yearlyPrice : plan.monthlyPrice,
    );
    const subtotal = unitPrice;
    const taxRate = dto.taxRate ?? 10;
    const taxAmount = (subtotal * taxRate) / 100;

    let discount = dto.discountAmount ?? 0;
    let couponCode: string | null = null;

    if (dto.couponCode) {
      const coupon = await this.coupons.findOne({ where: { code: dto.couponCode, isActive: true } });
      if (!coupon) throw new BadRequestException('Invalid coupon');
      if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
        throw new BadRequestException('Coupon expired');
      }
      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
        throw new BadRequestException('Coupon usage limit reached');
      }
      const val = parseFloat(coupon.value);
      discount += coupon.type === 'percent' ? (subtotal * val) / 100 : val;
      couponCode = coupon.code;
      coupon.usedCount += 1;
      await this.coupons.save(coupon);
    }

    const total = Math.max(0, subtotal + taxAmount - discount);
    const now = new Date();
    const due = new Date(now);
    due.setDate(due.getDate() + 7);

    const invoice = this.invoices.create({
      tenantId,
      invoiceNumber: await this.nextNumber(),
      subscriptionId: sub.id,
      status: InvoiceStatus.ISSUED,
      currency: plan.currency,
      subtotal: subtotal.toFixed(2),
      taxRate: taxRate.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      discountAmount: discount.toFixed(2),
      couponCode,
      total: total.toFixed(2),
      issuedAt: now,
      dueAt: due,
      createdBy: userId,
    });

    const saved = await this.invoices.save(invoice);

    await this.items.save(
      this.items.create({
        invoiceId: saved.id,
        description: `${plan.name} (${sub.billingCycle})`,
        quantity: 1,
        unitPrice: unitPrice.toFixed(2),
        amount: subtotal.toFixed(2),
      }),
    );

    await this.safeAudit('BillingInvoice', saved.id, AuditAction.CREATE, {
      newData: { invoiceNumber: saved.invoiceNumber, total: saved.total },
    });

    this.logger.log(`Generated invoice ${saved.invoiceNumber} for tenant ${tenantId}`);
    return this.get(saved.id);
  }

  async void(id: string): Promise<BillingInvoice> {
    const inv = await this.get(id);
    if (inv.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Already voided');
    }
    if (inv.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot void a paid invoice');
    }
    inv.status = InvoiceStatus.VOID;
    inv.voidedAt = new Date();
    inv.updatedBy = this.safeUserId();
    const saved = await this.invoices.save(inv);

    await this.safeAudit('BillingInvoice', saved.id, AuditAction.CANCEL, {
      newData: { status: 'VOID' },
    });
    try {
      await this.eventBus.publish(EventType.InvoiceGenerated, 'invoice', saved.id, {
        invoiceNumber: saved.invoiceNumber,
        total: saved.total,
      });
    } catch (e: any) {
      this.logger.warn('InvoiceGenerated event skipped: ' + e.message);
    }
    return saved;
  }

  /** Called on subscription renewal to auto-generate an invoice. */
  async onRenewal(subscriptionId: string, tenantId: string): Promise<BillingInvoice | null> {
    try {
      return await this.generate({ subscriptionId });
    } catch (e) {
      this.logger.warn(`Auto-invoice failed for ${subscriptionId}: ${e}`);
      return null;
    }
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
