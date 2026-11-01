import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ForecastHorizon } from './enums/revenue.enum';

export interface RevenueSegmentRow {
  key: string;
  label: string;
  mrr: number;
  arr: number;
  sharePct: number;
  customers: number;
  metadata: Record<string, unknown>;
}

export interface RevenueComputation {
  mrr: number;
  arr: number;
  expansionRevenue: number;
  contractionRevenue: number;
  netNewRevenue: number;
  upgrades: number;
  downgrades: number;
  paidRevenue: number;
  payingCustomers: number;
  customerCount: number;
  byPlan: RevenueSegmentRow[];
  byTenant: RevenueSegmentRow[];
  byCountry: RevenueSegmentRow[];
}

export interface ForecastRow {
  horizon: ForecastHorizon;
  periodStart: string;
  periodEnd: string;
  predictedRevenue: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
  method: string;
  inputs: Record<string, unknown>;
}

function numeric(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

/**
 * Revenue Intelligence data access. Queries are platform-wide by design and
 * only reachable through the revenue controller (platform operators).
 */
@Injectable()
export class RevenueDataService {
  constructor(private readonly dataSource: DataSource) {}

  async compute(windowDays = 30): Promise<RevenueComputation> {
    const [mrrRow] = await this.dataSource.query(
      `SELECT COALESCE(SUM(
                CASE WHEN s.billing_cycle = 'YEARLY'
                     THEN p.yearly_price / 12
                     ELSE p.monthly_price END
              ), 0)::numeric AS mrr
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'ACTIVE'`,
    );
    const [paying] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS paying FROM subscriptions WHERE status = 'ACTIVE'`,
    );
    const [customers] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS customers
         FROM tenants WHERE status IN ('active', 'trial')`,
    );

    const planRows: Array<{
      key: string;
      label: string;
      customers: number;
      mrr: string;
    }> = await this.dataSource.query(
      `SELECT p.code AS key, p.name AS label,
              COUNT(DISTINCT s.tenant_id)::int AS customers,
              COALESCE(SUM(CASE WHEN s.billing_cycle = 'YEARLY'
                                THEN p.yearly_price / 12
                                ELSE p.monthly_price END), 0)::numeric AS mrr
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'ACTIVE'
        GROUP BY p.code, p.name
        ORDER BY mrr DESC`,
    );
    const tenantRows: Array<{
      key: string;
      label: string;
      tenant_code: string;
      plan_code: string;
      mrr: string;
    }> = await this.dataSource.query(
      `SELECT t.id::text AS key, t.name AS label, t.code AS tenant_code,
              p.code AS plan_code,
              (CASE WHEN s.billing_cycle = 'YEARLY'
                    THEN p.yearly_price / 12
                    ELSE p.monthly_price END)::numeric AS mrr
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         JOIN tenants t ON t.id = s.tenant_id
        WHERE s.status = 'ACTIVE'
        ORDER BY mrr DESC`,
    );
    const countryRows: Array<{ key: string; customers: number; mrr: string }> =
      await this.dataSource.query(
        `SELECT COALESCE(NULLIF(t.settings->>'country', ''), 'UNKNOWN') AS key,
                COUNT(DISTINCT s.tenant_id)::int AS customers,
                COALESCE(SUM(CASE WHEN s.billing_cycle = 'YEARLY'
                                  THEN p.yearly_price / 12
                                  ELSE p.monthly_price END), 0)::numeric AS mrr
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           JOIN tenants t ON t.id = s.tenant_id
          WHERE s.status = 'ACTIVE'
          GROUP BY 1
          ORDER BY mrr DESC`,
      );

    const [changes] = await this.dataSource.query(
      `SELECT COALESCE(SUM(GREATEST(np.monthly_price - op.monthly_price, 0)), 0)::numeric AS expansion,
              COALESCE(SUM(GREATEST(op.monthly_price - np.monthly_price, 0)), 0)::numeric AS contraction,
              COUNT(*) FILTER (WHERE np.monthly_price > op.monthly_price)::int AS upgrades,
              COUNT(*) FILTER (WHERE np.monthly_price < op.monthly_price)::int AS downgrades
         FROM audit_logs a
         JOIN plans np ON np.code = a.new_data->>'planCode'
         JOIN plans op ON op.code = a.old_data->>'planCode'
        WHERE a.entity_type ILIKE 'subscription'
          AND a.action = 'UPDATE'
          AND a.created_at > now() - ($1 * interval '1 day')`,
      [windowDays],
    );
    const [paid] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS paid
         FROM billing_invoices
        WHERE status = 'PAID'
          AND paid_at IS NOT NULL
          AND paid_at > now() - ($1 * interval '1 day')`,
      [windowDays],
    );

    const mrr = round2(numeric(mrrRow.mrr));
    const expansionRevenue = round2(numeric(changes.expansion));
    const contractionRevenue = round2(numeric(changes.contraction));
    const share = (value: number): number =>
      mrr > 0 ? round2((value / mrr) * 100) : 0;

    const byPlan: RevenueSegmentRow[] = planRows.map((row) => ({
      key: row.key,
      label: row.label,
      mrr: round2(numeric(row.mrr)),
      arr: round2(numeric(row.mrr) * 12),
      sharePct: share(numeric(row.mrr)),
      customers: row.customers,
      metadata: { planCode: row.key },
    }));
    const byTenant: RevenueSegmentRow[] = tenantRows.map((row) => ({
      key: row.key,
      label: row.label,
      mrr: round2(numeric(row.mrr)),
      arr: round2(numeric(row.mrr) * 12),
      sharePct: share(numeric(row.mrr)),
      customers: 1,
      metadata: { tenantCode: row.tenant_code, planCode: row.plan_code },
    }));
    const byCountry: RevenueSegmentRow[] = countryRows.map((row) => ({
      key: row.key,
      label: row.key,
      mrr: round2(numeric(row.mrr)),
      arr: round2(numeric(row.mrr) * 12),
      sharePct: share(numeric(row.mrr)),
      customers: row.customers,
      metadata: {},
    }));

    return {
      mrr,
      arr: round2(mrr * 12),
      expansionRevenue,
      contractionRevenue,
      netNewRevenue: round2(expansionRevenue - contractionRevenue),
      upgrades: changes.upgrades,
      downgrades: changes.downgrades,
      paidRevenue: round2(numeric(paid.paid)),
      payingCustomers: paying.paying,
      customerCount: customers.customers,
      byPlan,
      byTenant,
      byCountry,
    };
  }

  async trends(months = 6, tenantId: string) {
    const paid: Array<{
      month: string;
      invoices: number;
      revenue: string;
    }> = await this.dataSource.query(
      `SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS month,
              COUNT(*)::int AS invoices,
              COALESCE(SUM(amount_paid), 0)::numeric AS revenue
         FROM billing_invoices
        WHERE status = 'PAID'
          AND paid_at IS NOT NULL
          AND paid_at > now() - ($1 * interval '1 month')
        GROUP BY 1 ORDER BY 1`,
      [months],
    );
    const planChanges: Array<{
      month: string;
      upgrades: number;
      downgrades: number;
      expansion: string;
      contraction: string;
    }> = await this.dataSource.query(
      `SELECT to_char(date_trunc('month', a.created_at), 'YYYY-MM') AS month,
              COUNT(*) FILTER (WHERE np.monthly_price > op.monthly_price)::int AS upgrades,
              COUNT(*) FILTER (WHERE np.monthly_price < op.monthly_price)::int AS downgrades,
              COALESCE(SUM(GREATEST(np.monthly_price - op.monthly_price, 0)), 0)::numeric AS expansion,
              COALESCE(SUM(GREATEST(op.monthly_price - np.monthly_price, 0)), 0)::numeric AS contraction
         FROM audit_logs a
         JOIN plans np ON np.code = a.new_data->>'planCode'
         JOIN plans op ON op.code = a.old_data->>'planCode'
        WHERE a.entity_type ILIKE 'subscription'
          AND a.action = 'UPDATE'
          AND a.created_at > now() - ($1 * interval '1 month')
        GROUP BY 1 ORDER BY 1`,
      [months],
    );
    const mrrHistory: Array<{ month: string; mrr: string; arr: string }> =
      await this.dataSource.query(
        `SELECT to_char(snapshot_date, 'YYYY-MM') AS month,
                MAX(mrr)::numeric AS mrr,
                MAX(arr)::numeric AS arr
           FROM revenue_snapshots
          WHERE tenant_id = $1
            AND period_type = 'MONTHLY'
            AND snapshot_date > now() - ($2 * interval '1 month')
          GROUP BY 1 ORDER BY 1`,
        [tenantId, months],
      );

    return {
      revenue: paid.map((row) => ({
        month: row.month,
        invoices: row.invoices,
        revenue: round2(numeric(row.revenue)),
      })),
      planChanges: planChanges.map((row) => ({
        month: row.month,
        upgrades: row.upgrades,
        downgrades: row.downgrades,
        expansion: round2(numeric(row.expansion)),
        contraction: round2(numeric(row.contraction)),
      })),
      mrr: mrrHistory.map((row) => ({
        month: row.month,
        mrr: round2(numeric(row.mrr)),
        arr: round2(numeric(row.arr)),
      })),
    };
  }


  async topCustomers(limit = 10): Promise<Array<RevenueSegmentRow & { rank: number }>> {
    const computed = await this.compute();
    return computed.byTenant
      .slice(0, limit)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  /**
   * Revenue forecast from MRR growth. Growth prefers month-over-month snapshot
   * history; without history it falls back to (expansion - contraction)/MRR.
   */
  async forecast(
    tenantId: string,
    computed: RevenueComputation,
    windowDays = 30,
  ): Promise<ForecastRow[]> {
    const history: Array<{ mrr: string }> = await this.dataSource.query(
      `SELECT mrr
         FROM revenue_snapshots
        WHERE tenant_id = $1 AND period_type = 'MONTHLY'
        ORDER BY snapshot_date ASC
        LIMIT 6`,
      [tenantId],
    );

    let growthPct = 0;
    if (history.length >= 2) {
      const previous = numeric(history[history.length - 2].mrr);
      const current = numeric(history[history.length - 1].mrr);
      if (previous > 0) growthPct = ((current - previous) / previous) * 100;
    } else if (computed.mrr > 0) {
      growthPct =
        ((computed.expansionRevenue - computed.contractionRevenue) /
          computed.mrr) *
        100;
    }
    growthPct = Math.max(-30, Math.min(30, round2(growthPct)));

    const monthly = round2(computed.mrr * (1 + growthPct / 100));
    const confidence = Math.min(
      0.85,
      round2(0.55 + Math.min(history.length, 6) * 0.05),
    );
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const endOf = (monthsAhead: number): string =>
      isoDate(new Date(addMonths(start, monthsAhead).getTime() - 86_400_000));
    const inputs = {
      mrr: computed.mrr,
      growthPct,
      historyMonths: history.length,
      windowDays,
      expansionRevenue: computed.expansionRevenue,
      contractionRevenue: computed.contractionRevenue,
    };

    const build = (
      horizon: ForecastHorizon,
      months: number,
      spread: number,
    ): ForecastRow => {
      const predicted = round2(monthly * months);
      return {
        horizon,
        periodStart: isoDate(start),
        periodEnd: endOf(months),
        predictedRevenue: predicted,
        lowerBound: round2(predicted * (1 - spread)),
        upperBound: round2(predicted * (1 + spread)),
        confidence,
        method: 'MRR_GROWTH_LINEAR',
        inputs,
      };
    };

    return [
      build(ForecastHorizon.NEXT_MONTH, 1, 0.1),
      build(ForecastHorizon.QUARTER, 3, 0.15),
      build(ForecastHorizon.ANNUAL, 12, 0.2),
    ];
  }
}

