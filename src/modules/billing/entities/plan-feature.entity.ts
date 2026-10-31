import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Plan } from './plan.entity';
import { PlanFeatureCode } from '../enums/billing.enum';

/**
 * PlanFeature – quota / limit definition for a plan.
 * limitValue = null means unlimited.
 */
@Entity('plan_features')
@Unique(['planId', 'featureCode'])
export class PlanFeature extends BaseEntity {
  @Index()
  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, (plan) => plan.features, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @Column({ name: 'feature_code', type: 'varchar', length: 40 })
  featureCode!: PlanFeatureCode;

  /** null = unlimited */
  @Column({ name: 'limit_value', type: 'int', nullable: true })
  limitValue!: number | null;

  @Column({ name: 'is_unlimited', type: 'boolean', default: false })
  isUnlimited!: boolean;
}
