import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { RuleExecutionStatus } from '../enums/rule.enum';
import { RuleDefinition } from './rule-definition.entity';

/**
 * RuleExecution – one evaluation of a rule.
 */
@Entity('rule_executions')
@Index(['ruleId', 'status'])
@Index(['tenantId', 'evaluatedAt'])
export class RuleExecution extends BaseTenantEntity {
  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId!: string;

  @ManyToOne(() => RuleDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule!: RuleDefinition;

  @Column({
    type: 'varchar',
    length: 20,
    default: RuleExecutionStatus.NOT_MATCHED,
  })
  status!: RuleExecutionStatus;

  @Column({ name: 'evaluated_at', type: 'timestamptz', default: () => 'now()' })
  evaluatedAt!: Date;

  @Column({ type: 'jsonb', default: {} })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  result!: Record<string, unknown>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;
}
