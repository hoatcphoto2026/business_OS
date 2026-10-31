import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ConditionType, RuleOperator } from '../enums/rule.enum';
import { RuleDefinition } from './rule-definition.entity';

/**
 * RuleCondition – a single condition in a rule.
 */
@Entity('rule_conditions')
@Index(['ruleId'])
export class RuleCondition extends BaseTenantEntity {
  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId!: string;

  @ManyToOne(() => RuleDefinition, (r) => r.conditions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule!: RuleDefinition;

  @Column({
    name: 'condition_type',
    type: 'varchar',
    length: 40,
  })
  conditionType!: ConditionType;

  @Column({
    type: 'varchar',
    length: 5,
    default: RuleOperator.GT,
  })
  operator!: RuleOperator;

  @Column({ type: 'varchar', length: 255 })
  value!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
