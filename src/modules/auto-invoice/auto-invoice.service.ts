import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoInvoice } from './entities/auto-invoice.entity';
import { AutoInvoiceItem } from './entities/auto-invoice-item.entity';
import { InvoiceTrigger, AutoInvoiceStatus } from './enums/auto-invoice.enum';
import { GenerateAutoInvoiceDto } from './dto/generate-auto-invoice.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

@Injectable()
export class AutoInvoiceService {
  private readonly logger = new Logger(AutoInvoiceService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(AutoInvoice)
    private readonly invoices: Repository<AutoInvoice>,
    @InjectRepository(AutoInvoiceItem)
    private readonly items: Repository<AutoInvoiceItem>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
  }

  private getUserId(): string {
    return this.tenantContext.getCurrentUserId() || '';
  }

  private inc(name: string) {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  getPrometheusText(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters.entries()) {
      lines.push(`# TYPE ${k} counter`);
      lines.push(`${k} ${v}`);
    }
    return lines.join('\n') + '\n';
  }

  private nextNumber(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const seq = Math.floor(Math.random() * 9000) + 1000;
    return `AUTO-${y}${m}-${seq}`;
  }

  async generate(dto: GenerateAutoInvoiceDto): Promise<AutoInvoice> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const invoice = this.invoices.create({
      tenantId,
      invoiceNumber: this.nextNumber(),
      trigger: dto.trigger,
      status: AutoInvoiceStatus.PENDING,
      couponCode: dto.couponCode ?? null,
      createdBy: userId || null,
    });
    const saved = await this.invoices.save(invoice);

    try {
      // Build items based on trigger
      const lineItems = this.buildItems(dto.trigger);
      let subtotal = 0;

      for (const li of lineItems) {
        const item = this.items.create({
          tenantId,
          invoiceId: saved.id,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.quantity * li.unitPrice,
          createdBy: userId || null,
        });
        await this.items.save(item);
        subtotal += item.amount;
      }

      const discountPercent = dto.discountPercent ?? (dto.couponCode ? 10 : 0);
      const taxPercent = dto.taxPercent ?? 10;

      const discountAmount = Math.round(subtotal * discountPercent) / 100;
      const afterDiscount = subtotal - discountAmount;
      const taxAmount = Math.round(afterDiscount * taxPercent) / 100;
      const total = afterDiscount + taxAmount;

      saved.subtotal = subtotal;
      saved.discountAmount = discountAmount;
      saved.taxAmount = taxAmount;
      saved.total = total;
      saved.status = AutoInvoiceStatus.GENERATED;
      await this.invoices.save(saved);

      this.inc('auto_invoices_generated_total');
    } catch (err: any) {
      saved.status = AutoInvoiceStatus.FAILED;
      saved.errorMessage = err.message;
      await this.invoices.save(saved);
      this.inc('auto_invoices_failed_total');
      this.logger.warn(`Auto invoice failed: ${err.message}`);
    }

    try {
      await this.audit.logAction('auto_invoice', saved.id, AuditAction.CREATE, {
        newData: { invoiceNumber: saved.invoiceNumber, total: saved.total, status: saved.status },
      });
    } catch {}

    return this.invoices.findOne({
      where: { id: saved.id },
      relations: ['items'],
    }) as Promise<AutoInvoice>;
  }

  private buildItems(trigger: InvoiceTrigger): Array<{ description: string; quantity: number; unitPrice: number }> {
    switch (trigger) {
      case InvoiceTrigger.MONTHLY_BILLING:
        return [{ description: 'Monthly subscription', quantity: 1, unitPrice: 299000 }];
      case InvoiceTrigger.ANNUAL_BILLING:
        return [{ description: 'Annual subscription', quantity: 1, unitPrice: 2990000 }];
      case InvoiceTrigger.USAGE_OVERAGE:
        return [{ description: 'Usage overage', quantity: 1, unitPrice: 50000 }];
      case InvoiceTrigger.PLAN_UPGRADE:
        return [{ description: 'Plan upgrade prorate', quantity: 1, unitPrice: 150000 }];
      case InvoiceTrigger.PLAN_DOWNGRADE:
        return [{ description: 'Plan downgrade credit', quantity: 1, unitPrice: -50000 }];
      default:
        return [{ description: 'Service', quantity: 1, unitPrice: 0 }];
    }
  }

  async list(): Promise<AutoInvoice[]> {
    const tenantId = this.getTenantId();
    return this.invoices.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      relations: ['items'],
      take: 100,
    });
  }

  async get(id: string): Promise<AutoInvoice> {
    const tenantId = this.getTenantId();
    const inv = await this.invoices.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!inv) throw new NotFoundException('Auto invoice not found');
    return inv;
  }
}
