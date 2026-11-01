import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { GrowthSnapshotPeriod } from '../enums/growth.enum';

/** Growth snapshot: conversion metrics + funnel + segments per period. */
@Entity('growth_snapshots')
@Unique(['tenantId', 'snapshotDate', 'periodType'])
@Index(['tenantId', 'periodType', 'snapshotDate'])
export class GrowthSnapshot extends BaseTenantEntity {
  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate!: string;

  @Column({ name: 'period_type', type: 'varchar', length: 10 })
  periodType!: GrowthSnapshotPeriod;

  @Column({ name: 'trial_conversion_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  trialConversionPct!: string;

  @Column({ name: 'paid_conversion_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  paidConversionPct!: string;

  @Column({ name: 'expansion_rate_pct', type: 'numeric', precision: 7, scale: 2, default: 0 })
  expansionRatePct!: string;

  @Column({ name: 'upsell_rate_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  upsellRatePct!: string;

  @Column({ name: 'activation_rate_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  activationRatePct!: string;

  @Column({ name: 'onboarding_success_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  onboardingSuccessPct!: string;

  @Column({ type: 'int', default: 0 })
  tenants!: number;

  @Column({ type: 'int', default: 0 })
  trials!: number;

  @Column({ name: 'paid_tenants', type: 'int', default: 0 })
  paidTenants!: number;

  @Column({ name: 'activated_tenants', type: 'int', default: 0 })
  activatedTenants!: number;

  @Column({ type: 'int', default: 0 })
  upgrades!: number;

  @Column({ type: 'int', default: 0 })
  downgrades!: number;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  mrr!: string;

  @Column({ type: 'jsonb', default: {} })
  funnel!: Record<string, unknown>;

  @Column({ name: 'by_source', type: 'jsonb', default: [] })
  bySource!: Array<Record<string, unknown>>;

  @Column({ name: 'by_plan', type: 'jsonb', default: [] })
  byPlan!: Array<Record<string, unknown>>;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
