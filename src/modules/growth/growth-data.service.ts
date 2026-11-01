import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface GrowthSegmentRow {
  key: string;
  label: string;
  tenants: number;
  trials: number;
  paidTenants: number;
  mrr: number;
  sharePct: number;
}

export interface GrowthComputation {
  metrics: {
    trialConversionPct: number;
    paidConversionPct: number;
    expansionRatePct: number;
    upsellRatePct: number;
    activationRatePct: number;
    onboardingSuccessPct: number;
  };
  totals: {
    tenants: number;
    trials: number;
    paidTenants: number;
    activatedTenants: number;
    trialsCreated: number;
    trialConverted: number;
    subscriptionsCreated: number;
    paidConverted: number;
    upgrades: number;
    downgrades: number;
    upgradeTenants: number;
    expansionRevenue: number;
    contractionRevenue: number;
    mrr: number;
  };
  funnel: {
    stages: Array<{
      key: string;
      label: string;
      count: number;
      rateFromPreviousPct: number;
    }>;
    overallConversionPct: number;
  };
  planFunnel: {
    upgrades: number;
    downgrades: number;
    transitions: Array<{
      from: string;
      to: string;
      count: number;
      expansion: number;
      direction: 'UPGRADE' | 'DOWNGRADE';
    }>;
  };
  onboarding: {
    total: number;
    completed: number;
    failed: number;
    completedPct: number;
  };
  bySource: GrowthSegmentRow[];
  byPlan: GrowthSegmentRow[];
}

function numeric(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Computes growth intelligence from billing, auth, onboarding and audit data. */
@Injectable()
export class GrowthDataService {
  constructor(private readonly dataSource: DataSource) {}

  async compute(days = 30): Promise<GrowthComputation> {
    const [base] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tenants WHERE status IN ('active', 'trial')) AS tenants,
         (SELECT COUNT(*)::int FROM subscriptions
           WHERE status = 'TRIAL' OR trial_end IS NOT NULL) AS trials,
         (SELECT COUNT(*)::int FROM subscriptions WHERE status = 'ACTIVE') AS paid_tenants,
         (SELECT COUNT(DISTINCT tenant_id)::int FROM login_histories
           WHERE login_at > now() - ($1 * interval '1 day')) AS activated_tenants,
         (SELECT COUNT(*)::int FROM subscriptions
           WHERE created_at > now() - ($1 * interval '1 day')) AS subs_created,
         (SELECT COUNT(*)::int FROM subscriptions
           WHERE trial_end IS NOT NULL
             AND created_at > now() - ($1 * interval '1 day')) AS trials_created,
         (SELECT COUNT(*)::int FROM subscriptions
           WHERE status = 'ACTIVE' AND trial_end IS NULL
             AND created_at > now() - ($1 * interval '1 day')) AS paid_converted,
         (SELECT COALESCE(SUM(CASE WHEN s.billing_cycle = 'YEARLY'
                                   THEN p.yearly_price / 12
                                   ELSE p.monthly_price END), 0)::numeric
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan_id
           WHERE s.status = 'ACTIVE') AS mrr`,
      [days],
    );

    const [trialConversions] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT a.entity_id)::int AS converted
         FROM audit_logs a
        WHERE a.entity_type ILIKE 'subscription'
          AND a.action = 'UPDATE'
          AND a.created_at > now() - ($1 * interval '1 day')
          AND a.old_data->>'status' = 'TRIAL'
          AND a.new_data->>'status' = 'ACTIVE'`,
      [days],
    );

    const transitions: Array<{
      from_plan: string;
      to_plan: string;
      changes: number;
      tenants: number;
      old_price: string;
      new_price: string;
    }> = await this.dataSource.query(
      `SELECT a.old_data->>'planCode' AS from_plan,
              a.new_data->>'planCode' AS to_plan,
              COUNT(*)::int AS changes,
              COUNT(DISTINCT a.tenant_id)::int AS tenants,
              op.monthly_price::numeric AS old_price,
              np.monthly_price::numeric AS new_price
         FROM audit_logs a
         JOIN plans np ON np.code = a.new_data->>'planCode'
         JOIN plans op ON op.code = a.old_data->>'planCode'
        WHERE a.entity_type ILIKE 'subscription'
          AND a.action = 'UPDATE'
          AND a.created_at > now() - ($1 * interval '1 day')
          AND a.old_data->>'planCode' IS NOT NULL
          AND a.new_data->>'planCode' IS NOT NULL
        GROUP BY 1, 2, 5, 6`,
      [days],
    );

    let upgrades = 0;
    let downgrades = 0;
    let expansionRevenue = 0;
    let contractionRevenue = 0;
    const planTransitions = transitions.map((row) => {
      const oldPrice = numeric(row.old_price);
      const newPrice = numeric(row.new_price);
      const delta = round2((newPrice - oldPrice) * row.changes);
      const direction = newPrice >= oldPrice ? 'UPGRADE' : 'DOWNGRADE';
      if (direction === 'UPGRADE') {
        upgrades += row.changes;
        expansionRevenue += delta;
      } else {
        downgrades += row.changes;
        contractionRevenue += Math.abs(delta);
      }
      return {
        from: row.from_plan,
        to: row.to_plan,
        count: row.changes,
        expansion: delta,
        direction: direction as 'UPGRADE' | 'DOWNGRADE',
      };
    });

    const upgradeTenantRows: Array<{ tenant_id: string }> =
      await this.dataSource.query(
        `SELECT DISTINCT a.tenant_id
           FROM audit_logs a
           JOIN plans np ON np.code = a.new_data->>'planCode'
           JOIN plans op ON op.code = a.old_data->>'planCode'
          WHERE a.entity_type ILIKE 'subscription'
            AND a.action = 'UPDATE'
            AND a.created_at > now() - ($1 * interval '1 day')
            AND np.monthly_price > op.monthly_price`,
        [days],
      );
    const upgradeTenants = upgradeTenantRows.length;


    const sourceRows: Array<{
      key: string;
      tenants: number;
      trials: number;
      paid_tenants: number;
      mrr: string;
    }> = await this.dataSource.query(
      `SELECT COALESCE(NULLIF(t.settings->>'source', ''), 'UNKNOWN') AS key,
              COUNT(*)::int AS tenants,
              COUNT(*) FILTER (
                WHERE sub.status = 'TRIAL' OR sub.trial_end IS NOT NULL
              )::int AS trials,
              COUNT(*) FILTER (WHERE sub.status = 'ACTIVE')::int AS paid_tenants,
              COALESCE(SUM(
                CASE WHEN sub.status = 'ACTIVE' THEN
                  (CASE WHEN sub.billing_cycle = 'YEARLY'
                        THEN sub.yearly_price / 12
                        ELSE sub.monthly_price END)
                  ELSE 0 END
              ), 0)::numeric AS mrr
         FROM tenants t
         LEFT JOIN LATERAL (
           SELECT s.status, s.billing_cycle, s.trial_end,
                  p.monthly_price, p.yearly_price
             FROM subscriptions s
             JOIN plans p ON p.id = s.plan_id
            WHERE s.tenant_id = t.id
            ORDER BY s.created_at DESC
            LIMIT 1
         ) sub ON true
        WHERE t.status IN ('active', 'trial')
        GROUP BY 1
        ORDER BY tenants DESC`,
    );
    const planRows: Array<{
      key: string;
      label: string;
      tenants: number;
      mrr: string;
    }> = await this.dataSource.query(
      `SELECT p.code AS key, p.name AS label,
              COUNT(DISTINCT s.tenant_id)::int AS tenants,
              COALESCE(SUM(CASE WHEN s.billing_cycle = 'YEARLY'
                                THEN p.yearly_price / 12
                                ELSE p.monthly_price END), 0)::numeric AS mrr
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'ACTIVE'
        GROUP BY p.code, p.name
        ORDER BY mrr DESC`,
    );
    const [onboarding] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
         FROM tenant_onboardings
        WHERE tenant_id IS NOT NULL`,
    );


    const tenants = base.tenants as number;
    const paidTenants = base.paid_tenants as number;
    const activatedTenants = base.activated_tenants as number;
    const trialsCreated = base.trials_created as number;
    const subscriptionsCreated = base.subs_created as number;
    const paidConverted = base.paid_converted as number;
    const trialConverted = trialConversions.converted as number;
    const mrr = round2(numeric(base.mrr));
    const totalMrr = sourceRows.reduce((sum, row) => sum + numeric(row.mrr), 0);

    const bySource: GrowthSegmentRow[] = sourceRows.map((row) => ({
      key: row.key,
      label: row.key,
      tenants: row.tenants,
      trials: row.trials,
      paidTenants: row.paid_tenants,
      mrr: round2(numeric(row.mrr)),
      sharePct:
        totalMrr > 0
          ? round2((numeric(row.mrr) / totalMrr) * 100)
          : tenants > 0
            ? round2((row.tenants / tenants) * 100)
            : 0,
    }));
    const byPlan: GrowthSegmentRow[] = planRows.map((row) => ({
      key: row.key,
      label: row.label,
      tenants: row.tenants,
      trials: 0,
      paidTenants: row.tenants,
      mrr: round2(numeric(row.mrr)),
      sharePct: mrr > 0 ? round2((numeric(row.mrr) / mrr) * 100) : 0,
    }));

    const stages = [
      { key: 'TENANTS', label: 'Tenants', count: tenants },
      { key: 'ACTIVATED', label: 'Activated (logged in)', count: activatedTenants },
      { key: 'PAID', label: 'Paid subscription', count: paidTenants },
      { key: 'EXPANDED', label: 'Expanded (upgrade)', count: upgradeTenants },
    ].map((stage, index, list) => {
      const previous = index > 0 ? list[index - 1].count : stage.count;
      return {
        ...stage,
        rateFromPreviousPct:
          previous > 0 ? round2((stage.count / previous) * 100) : 0,
      };
    });

    const onboardingCompleted = onboarding.completed as number;
    const onboardingTotal = onboarding.total as number;

    return {
      metrics: {
        trialConversionPct:
          trialsCreated > 0
            ? round2(Math.min(100, (trialConverted / trialsCreated) * 100))
            : trialConverted > 0
              ? 100
              : 0,
        paidConversionPct:
          subscriptionsCreated > 0
            ? round2(Math.min(100, (paidConverted / subscriptionsCreated) * 100))
            : 0,
        expansionRatePct:
          mrr > 0 ? round2((expansionRevenue / mrr) * 100) : 0,
        upsellRatePct:
          paidTenants > 0 ? round2((upgradeTenants / paidTenants) * 100) : 0,
        activationRatePct:
          tenants > 0 ? round2((activatedTenants / tenants) * 100) : 0,
        onboardingSuccessPct:
          onboardingTotal > 0
            ? round2((onboardingCompleted / onboardingTotal) * 100)
            : 0,
      },
      totals: {
        tenants,
        trials: base.trials as number,
        paidTenants,
        activatedTenants,
        trialsCreated,
        trialConverted,
        subscriptionsCreated,
        paidConverted,
        upgrades,
        downgrades,
        upgradeTenants,
        expansionRevenue: round2(expansionRevenue),
        contractionRevenue: round2(contractionRevenue),
        mrr,
      },
      funnel: {
        stages,
        overallConversionPct:
          tenants > 0 ? round2((upgradeTenants / tenants) * 100) : 0,
      },
      planFunnel: {
        upgrades,
        downgrades,
        transitions: planTransitions,
      },
      onboarding: {
        total: onboardingTotal,
        completed: onboardingCompleted,
        failed: onboarding.failed as number,
        completedPct:
          onboardingTotal > 0
            ? round2((onboardingCompleted / onboardingTotal) * 100)
            : 0,
      },
      bySource,
      byPlan,
    };
  }
}

