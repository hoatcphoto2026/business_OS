import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PlanCode } from '../enums/billing.enum';
import { PlanFeature } from './plan-feature.entity';

/**
 * Plan – global catalog of subscription plans.
 * Not tenant-scoped.
 */
@Entity('plans')
export class Plan extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, unique: true })
  code!: PlanCode;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Monthly price in minor units or as decimal. Stored as numeric. */
  @Column({ name: 'monthly_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  monthlyPrice!: string; // TypeORM returns numeric as string

  @Column({ name: 'yearly_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  yearlyPrice!: string;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'trial_days', type: 'int', default: 14 })
  trialDays!: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @OneToMany(() => PlanFeature, (pf) => pf.plan, { cascade: true })
  features!: PlanFeature[];
}
