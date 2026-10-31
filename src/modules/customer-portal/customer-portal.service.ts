import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from '../billing/billing.service';
import { InvoiceService } from '../billing/invoice.service';
import { UsageService } from '../billing/usage.service';
import { PaymentService } from '../billing/payment.service';
import { BillingInvoice } from '../billing/entities/billing-invoice.entity';
import { PaymentTransaction } from '../billing/entities/payment-transaction.entity';
import { UsageMetric } from '../billing/enums/usage.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { PlanFeatureCode } from '../billing/enums/billing.enum';

export interface DashboardResponse {
  currentPlan: {
    id: string;
    code: string;
    name: string;
    monthlyPrice: string;
    yearlyPrice: string;
    currency: string;
  } | null;
  subscriptionStatus: string | null;
  nextBillingDate: string | null;
  usageSummary: Record<string, { current: number; limit: number | null; percentage: number | null }>;
  recentPayments: Array<{
    id: string;
    amount: string;
    currency: string;
    status: string;
    processedAt: string | null;
    provider: string;
  }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    total: string;
    currency: string;
    issuedAt: string | null;
    dueAt: string | null;
  }>;
}

export interface UsageItem {
  metric: string;
  current: number;
  limit: number | null;
  percentage: number | null;
  unlimited: boolean;
}

@Injectable()
export class CustomerPortalService {
  private readonly logger = new Logger(CustomerPortalService.name);

  constructor(
    private readonly billing: BillingService,
    private readonly invoices: InvoiceService,
    private readonly usage: UsageService,
    private readonly payments: PaymentService,
    private readonly tenantContext: TenantContextService,
    @InjectRepository(BillingInvoice)
    private readonly billingInvoices: Repository<BillingInvoice>,
    @InjectRepository(PaymentTransaction)
    private readonly paymentTx: Repository<PaymentTransaction>,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new NotFoundException('No tenant context');
    return tid;
  }

  async getDashboard(): Promise<DashboardResponse> {
    const tenantId = this.getTenantId();
    const sub = await this.billing.getCurrentSubscription();
    const plan = sub?.plan ?? null;

    const usageCurrent = await this.usage.getCurrent(tenantId);
    const features = plan?.features ?? [];

    const usageSummary: DashboardResponse['usageSummary'] = {};
    const metricMap: Record<string, string> = {
      [UsageMetric.ACTIVE_USERS]: PlanFeatureCode.USERS,
      [UsageMetric.API_CALLS]: PlanFeatureCode.API_KEYS, // approximate; refine if needed
      [UsageMetric.WEBHOOKS]: PlanFeatureCode.WEBHOOKS,
      [UsageMetric.STORAGE_GB]: PlanFeatureCode.STORAGE_GB,
      [UsageMetric.AI_REQUESTS]: PlanFeatureCode.AI_REQUESTS,
    };

    for (const [metric, featureCode] of Object.entries(metricMap)) {
      const current = usageCurrent[metric] ?? 0;
      const feat = features.find((f) => f.featureCode === featureCode);
      const limit = feat?.isUnlimited ? null : feat?.limitValue ?? null;
      const percentage = limit && limit > 0 ? Math.round((current / limit) * 100) : null;
      usageSummary[metric] = { current, limit, percentage };
    }

    const recentPayments = await this.paymentTx.find({
      where: { tenantId },
      order: { processedAt: 'DESC', createdAt: 'DESC' },
      take: 5,
    });

    const recentInvoices = await this.billingInvoices.find({
      where: { tenantId },
      order: { issuedAt: 'DESC', createdAt: 'DESC' },
      take: 5,
    });

    return {
      currentPlan: plan
        ? {
            id: plan.id,
            code: plan.code,
            name: plan.name,
            monthlyPrice: plan.monthlyPrice,
            yearlyPrice: plan.yearlyPrice,
            currency: plan.currency,
          }
        : null,
      subscriptionStatus: sub?.status ?? null,
      nextBillingDate: sub?.currentPeriodEnd?.toISOString() ?? null,
      usageSummary,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        processedAt: p.processedAt?.toISOString() ?? null,
        provider: p.provider,
      })),
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        total: inv.total,
        currency: inv.currency,
        issuedAt: inv.issuedAt?.toISOString() ?? null,
        dueAt: inv.dueAt?.toISOString() ?? null,
      })),
    };
  }

  async getSubscription() {
    return this.billing.getCurrentSubscription();
  }

  async changePlan(dto: any) {
    return this.billing.changePlan(dto);
  }

  async cancel(dto: any) {
    return this.billing.cancel(dto);
  }

  async reactivate() {
    return this.billing.reactivate();
  }

  async listInvoices() {
    return this.invoices.list();
  }

  async getInvoice(id: string) {
    return this.invoices.get(id);
  }

  /**
   * Generate a simple PDF buffer for an invoice.
   * In production, replace with pdfkit / puppeteer / external service.
   */
  async generateInvoicePdf(id: string): Promise<Buffer> {
    const inv = await this.invoices.get(id);
    if (!inv) throw new NotFoundException('Invoice not found');

    // Minimal valid PDF with invoice summary (text content)
    const content = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      '4 0 obj << /Length 200 >> stream',
      'BT /F1 16 Tf 50 750 Td (Invoice ' + (inv.invoiceNumber || id) + ') Tj ET',
      'BT /F1 12 Tf 50 720 Td (Status: ' + inv.status + ') Tj ET',
      'BT /F1 12 Tf 50 700 Td (Total: ' + inv.total + ' ' + inv.currency + ') Tj ET',
      'endstream endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      'xref',
      '0 6',
      '0000000000 65535 f ',
      'trailer << /Size 6 /Root 1 0 R >>',
      'startxref',
      '0',
      '%%EOF',
    ].join('\n');

    return Buffer.from(content, 'utf-8');
  }

  async listPayments() {
    const tenantId = this.getTenantId();
    return this.paymentTx.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getUsage(): Promise<UsageItem[]> {
    const tenantId = this.getTenantId();
    const sub = await this.billing.getCurrentSubscription();
    const plan = sub?.plan;

    const current = await this.usage.getCurrent(tenantId);
    const features = plan?.features ?? [];

    const mapping: Array<{ metric: UsageMetric; feature: PlanFeatureCode; label: string }> = [
      { metric: UsageMetric.ACTIVE_USERS, feature: PlanFeatureCode.USERS, label: 'Active Users' },
      { metric: UsageMetric.API_CALLS, feature: PlanFeatureCode.API_KEYS, label: 'API Calls' },
      { metric: UsageMetric.WEBHOOKS, feature: PlanFeatureCode.WEBHOOKS, label: 'Webhooks' },
      { metric: UsageMetric.STORAGE_GB, feature: PlanFeatureCode.STORAGE_GB, label: 'Storage (GB)' },
      { metric: UsageMetric.AI_REQUESTS, feature: PlanFeatureCode.AI_REQUESTS, label: 'AI Requests' },
    ];

    return mapping.map(({ metric, feature, label }) => {
      const curr = current[metric] ?? 0;
      const feat = features.find((f) => f.featureCode === feature);
      const unlimited = feat?.isUnlimited ?? false;
      const limit = unlimited ? null : feat?.limitValue ?? null;
      const percentage = !unlimited && limit && limit > 0 ? Math.round((curr / limit) * 100) : null;
      return {
        metric: label,
        current: curr,
        limit,
        percentage,
        unlimited,
      };
    });
  }
}
