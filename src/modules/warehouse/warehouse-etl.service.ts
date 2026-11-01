import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface EtlFactCounts {
  revenue: number;
  usage: number;
  customer: number;
  compliance: number;
  security: number;
}

export interface DimensionCounts {
  dates: number;
  tenants: number;
  plans: number;
  organizations: number;
  departments: number;
}

/** D8 ETL: refreshes dimensions and upserts daily fact rows (idempotent). */
@Injectable()
export class WarehouseEtlService {
  private readonly logger = new Logger(WarehouseEtlService.name);

  constructor(private readonly dataSource: DataSource) {}

  async refreshDimensions(ownerTenantId: string): Promise<DimensionCounts> {
    const dates: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO warehouse_dim_dates
         (id, tenant_id, date_key, calendar_date, year, quarter, month, month_name,
          week_of_year, day_of_week, day_name, is_weekend, created_at, updated_at)
       SELECT gen_random_uuid(), $1, to_char(d, 'YYYYMMDD')::int, d::date,
              EXTRACT(YEAR FROM d)::int, EXTRACT(QUARTER FROM d)::int,
              EXTRACT(MONTH FROM d)::int, to_char(d, 'Mon'),
              EXTRACT(WEEK FROM d)::int, EXTRACT(DOW FROM d)::int,
              to_char(d, 'Dy'), EXTRACT(DOW FROM d) IN (0, 6), now(), now()
         FROM generate_series(
                CURRENT_DATE - interval '400 days',
                CURRENT_DATE + interval '30 days',
                interval '1 day') AS d
       ON CONFLICT (tenant_id, date_key) DO UPDATE
         SET calendar_date = EXCLUDED.calendar_date, updated_at = now()
       RETURNING id`,
      [ownerTenantId],
    );

    const tenants: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO warehouse_dim_tenants
         (id, tenant_id, source_tenant_id, code, name, plan_code, status, country,
          source_updated_at, created_at, updated_at)
       SELECT gen_random_uuid(), $1, t.id, t.code, t.name, t.plan::text,
              t.status::text, t.settings->>'country', t.updated_at, now(), now()
         FROM tenants t
       ON CONFLICT (tenant_id, source_tenant_id) DO UPDATE
         SET code = EXCLUDED.code, name = EXCLUDED.name,
             plan_code = EXCLUDED.plan_code, status = EXCLUDED.status,
             country = EXCLUDED.country,
             source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
       RETURNING id`,
      [ownerTenantId],
    );

    const plans: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO warehouse_dim_plans
         (id, tenant_id, plan_code, name, monthly_price, yearly_price, currency,
          is_active, created_at, updated_at)
       SELECT gen_random_uuid(), $1, p.code::text, p.name, p.monthly_price,
              p.yearly_price, p.currency, p.is_active, now(), now()
         FROM plans p
       ON CONFLICT (tenant_id, plan_code) DO UPDATE
         SET name = EXCLUDED.name, monthly_price = EXCLUDED.monthly_price,
             yearly_price = EXCLUDED.yearly_price, currency = EXCLUDED.currency,
             is_active = EXCLUDED.is_active, updated_at = now()
       RETURNING id`,
      [ownerTenantId],
    );

    const organizations: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO warehouse_dim_organizations
         (id, tenant_id, source_organization_id, source_tenant_id, code, name,
          status, created_at, updated_at)
       SELECT gen_random_uuid(), $1, c.id, c.tenant_id, c.code, c.name,
              c.status::text, now(), now()
         FROM companies c
       ON CONFLICT (tenant_id, source_organization_id) DO UPDATE
         SET code = EXCLUDED.code, name = EXCLUDED.name,
             status = EXCLUDED.status, updated_at = now()
       RETURNING id`,
      [ownerTenantId],
    );

    const departments: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO warehouse_dim_departments
         (id, tenant_id, source_department_id, source_organization_id,
          source_tenant_id, code, name, status, created_at, updated_at)
       SELECT gen_random_uuid(), $1, d.id, d.company_id, d.tenant_id, d.code,
              d.name, d.status::text, now(), now()
         FROM departments d
       ON CONFLICT (tenant_id, source_department_id) DO UPDATE
         SET code = EXCLUDED.code, name = EXCLUDED.name,
             status = EXCLUDED.status, updated_at = now()
       RETURNING id`,
      [ownerTenantId],
    );

    return {
      dates: dates.length,
      tenants: tenants.length,
      plans: plans.length,
      organizations: organizations.length,
      departments: departments.length,
    };
  }

  async run(
    ownerTenantId: string,
    from: string,
    to: string,
    refreshDimensions = true,
  ): Promise<{ dimensions: DimensionCounts | null; facts: EtlFactCounts }> {
    const dimensions = refreshDimensions
      ? await this.refreshDimensions(ownerTenantId)
      : null;

    const facts: EtlFactCounts = {
      revenue: await this.insertRevenue(ownerTenantId, from, to),
      usage: await this.insertUsage(ownerTenantId, from, to),
      customer: await this.insertCustomer(ownerTenantId, from, to),
      compliance: await this.insertCompliance(ownerTenantId, from, to),
      security: await this.insertSecurity(ownerTenantId, from, to),
    };

    this.logger.log(
      `Warehouse ETL ${from}..${to} → revenue=${facts.revenue} usage=${facts.usage} ` +
        `customer=${facts.customer} compliance=${facts.compliance} security=${facts.security}`,
    );
    return { dimensions, facts };
  }

  private async insertRevenue(
    ownerTenantId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO fact_revenue
         (id, tenant_id, date_key, fact_date, source_tenant_id, plan_code,
          organization_id, revenue_amount, invoice_count, mrr,
          active_subscriptions, currency, created_at, updated_at)
       SELECT gen_random_uuid(), $1, to_char(d.day, 'YYYYMMDD')::int, d.day,
              t.id, t.plan::text, NULL,
              COALESCE(inv.amount, 0), COALESCE(inv.cnt, 0),
              COALESCE(sub.mrr, 0), COALESCE(sub.cnt, 0), 'VND', now(), now()
         FROM tenants t
         CROSS JOIN generate_series($2::date, $3::date, interval '1 day') AS d(day)
         LEFT JOIN LATERAL (
           SELECT SUM(i.amount_paid) AS amount, COUNT(*)::int AS cnt
             FROM billing_invoices i
            WHERE i.tenant_id = t.id
              AND i.paid_at >= d.day
              AND i.paid_at < d.day + interval '1 day'
         ) inv ON true
         LEFT JOIN LATERAL (
           SELECT SUM(p.monthly_price) AS mrr, COUNT(*)::int AS cnt
             FROM subscriptions s
             JOIN plans p ON p.id = s.plan_id
            WHERE s.tenant_id = t.id AND s.status = 'ACTIVE'
         ) sub ON true
       ON CONFLICT (tenant_id, date_key, source_tenant_id, plan_code) DO UPDATE
         SET revenue_amount = EXCLUDED.revenue_amount,
             invoice_count = EXCLUDED.invoice_count,
             mrr = EXCLUDED.mrr,
             active_subscriptions = EXCLUDED.active_subscriptions,
             updated_at = now()
       RETURNING id`,
      [ownerTenantId, from, to],
    );
    return rows.length;
  }

  private async insertUsage(
    ownerTenantId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO fact_usage
         (id, tenant_id, date_key, fact_date, source_tenant_id, metric, quantity,
          event_count, organization_id, department_id, created_at, updated_at)
       SELECT gen_random_uuid(), $1,
              to_char(u.recorded_at::date, 'YYYYMMDD')::int, u.recorded_at::date,
              u.tenant_id, u.metric, SUM(u.quantity)::numeric, COUNT(*)::int,
              NULL, NULL, now(), now()
         FROM usage_records u
        WHERE u.recorded_at >= $2::date
          AND u.recorded_at < ($3::date + interval '1 day')
        GROUP BY u.tenant_id, u.metric, u.recorded_at::date
       ON CONFLICT (tenant_id, date_key, source_tenant_id, metric) DO UPDATE
         SET quantity = EXCLUDED.quantity,
             event_count = EXCLUDED.event_count, updated_at = now()
       RETURNING id`,
      [ownerTenantId, from, to],
    );
    return rows.length;
  }


  private async insertCustomer(
    ownerTenantId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO fact_customer
         (id, tenant_id, date_key, fact_date, source_tenant_id, plan_code,
          organization_id, department_id, active_users, login_count,
          tickets_opened, health_score, churn_candidate, created_at, updated_at)
       SELECT gen_random_uuid(), $1, to_char(d.day, 'YYYYMMDD')::int, d.day,
              t.id, t.plan::text, NULL, NULL,
              COALESCE(l.users, 0), COALESCE(l.logins, 0),
              COALESCE(tk.cnt, 0), COALESCE(h.score, 0),
              COALESCE(h.churn, false), now(), now()
         FROM tenants t
         CROSS JOIN generate_series($2::date, $3::date, interval '1 day') AS d(day)
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT lh.user_id)::int AS users, COUNT(*)::int AS logins
             FROM login_histories lh
            WHERE lh.tenant_id = t.id
              AND lh.login_at >= d.day
              AND lh.login_at < d.day + interval '1 day'
         ) l ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt
             FROM support_tickets st
            WHERE st.tenant_id = t.id
              AND st.created_at >= d.day
              AND st.created_at < d.day + interval '1 day'
         ) tk ON true
         LEFT JOIN LATERAL (
           SELECT ch.score, ch.churn_candidate AS churn
             FROM customer_health_scores ch
            WHERE ch.target_tenant_id = t.id
            ORDER BY ch.scored_at DESC
            LIMIT 1
         ) h ON true
       ON CONFLICT (tenant_id, date_key, source_tenant_id) DO UPDATE
         SET plan_code = EXCLUDED.plan_code,
             active_users = EXCLUDED.active_users,
             login_count = EXCLUDED.login_count,
             tickets_opened = EXCLUDED.tickets_opened,
             health_score = EXCLUDED.health_score,
             churn_candidate = EXCLUDED.churn_candidate,
             updated_at = now()
       RETURNING id`,
      [ownerTenantId, from, to],
    );
    return rows.length;
  }


  private async insertCompliance(
    ownerTenantId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO fact_compliance
         (id, tenant_id, date_key, fact_date, source_tenant_id, evidence_total,
          evidence_verified, open_risks, critical_risks, compliance_score,
          created_at, updated_at)
       SELECT gen_random_uuid(), $1, to_char(d.day, 'YYYYMMDD')::int, d.day,
              t.id, COALESCE(c.total, 0), COALESCE(c.verified, 0),
              COALESCE(c.open, 0), COALESCE(c.critical, 0),
              GREATEST(0, 100 - COALESCE(c.critical, 0) * 20
                           - (COALESCE(c.open, 0) - COALESCE(c.critical, 0)) * 5),
              now(), now()
         FROM tenants t
         CROSS JOIN generate_series($2::date, $3::date, interval '1 day') AS d(day)
         LEFT JOIN LATERAL (
           SELECT
             (SELECT COUNT(*)::int FROM compliance_evidence e
               WHERE e.tenant_id = t.id
                 AND e.created_at < d.day + interval '1 day') AS total,
             (SELECT COUNT(*)::int FROM compliance_evidence e
               WHERE e.tenant_id = t.id AND e.status = 'VERIFIED'
                 AND e.created_at < d.day + interval '1 day') AS verified,
             (SELECT COUNT(*)::int FROM compliance_risks r
               WHERE r.tenant_id = t.id AND r.status = 'OPEN'
                 AND r.created_at < d.day + interval '1 day') AS open,
             (SELECT COUNT(*)::int FROM compliance_risks r
               WHERE r.tenant_id = t.id AND r.status = 'OPEN'
                 AND r.severity = 'CRITICAL'
                 AND r.created_at < d.day + interval '1 day') AS critical
         ) c ON true
       ON CONFLICT (tenant_id, date_key, source_tenant_id) DO UPDATE
         SET evidence_total = EXCLUDED.evidence_total,
             evidence_verified = EXCLUDED.evidence_verified,
             open_risks = EXCLUDED.open_risks,
             critical_risks = EXCLUDED.critical_risks,
             compliance_score = EXCLUDED.compliance_score,
             updated_at = now()
       RETURNING id`,
      [ownerTenantId, from, to],
    );
    return rows.length;
  }


  private async insertSecurity(
    ownerTenantId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO fact_security
         (id, tenant_id, date_key, fact_date, source_tenant_id, security_events,
          critical_events, failed_logins, open_alerts, risk_score,
          created_at, updated_at)
       SELECT gen_random_uuid(), $1, to_char(d.day, 'YYYYMMDD')::int, d.day,
              t.id, COALESCE(ev.total, 0), COALESCE(ev.critical, 0),
              COALESCE(fl.cnt, 0), COALESCE(op.cnt, 0),
              LEAST(100, COALESCE(ev.critical, 0) * 15
                         + COALESCE(fl.cnt, 0) * 2 + COALESCE(op.cnt, 0) * 5),
              now(), now()
         FROM tenants t
         CROSS JOIN generate_series($2::date, $3::date, interval '1 day') AS d(day)
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE e.severity = 'CRITICAL')::int AS critical
             FROM security_events e
            WHERE e.tenant_id = t.id
              AND e.detected_at >= d.day
              AND e.detected_at < d.day + interval '1 day'
         ) ev ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt
             FROM security_login_attempts la
            WHERE la.tenant_id = t.id AND la.success = false
              AND la.created_at >= d.day
              AND la.created_at < d.day + interval '1 day'
         ) fl ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt
             FROM security_events e
            WHERE e.tenant_id = t.id AND e.status <> 'RESOLVED'
              AND e.detected_at < d.day + interval '1 day'
         ) op ON true
       ON CONFLICT (tenant_id, date_key, source_tenant_id) DO UPDATE
         SET security_events = EXCLUDED.security_events,
             critical_events = EXCLUDED.critical_events,
             failed_logins = EXCLUDED.failed_logins,
             open_alerts = EXCLUDED.open_alerts,
             risk_score = EXCLUDED.risk_score,
             updated_at = now()
       RETURNING id`,
      [ownerTenantId, from, to],
    );
    return rows.length;
  }
}

