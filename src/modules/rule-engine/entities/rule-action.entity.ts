import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ActionType } from '../enums/rule.enum';
import { RuleDefinition } from './rule-definition.entity';

/**
 * RuleAction – an action to execute when a rule matches.
 */
@Entity('rule_actions')
@Index(['ruleId'])
export class RuleAction extends BaseTenantEntity {
  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId!: string;

  @ManyToOne(() => RuleDefinition, (r) => r.actions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule!: RuleDefinition;

  @Column({
    name: 'action_type',
    type: 'varchar',
    length: 40,
  })
  actionType!: ActionType;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
