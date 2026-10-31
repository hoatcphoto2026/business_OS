import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { RuleCondition } from './rule-condition.entity';
import { RuleAction } from './rule-action.entity';

/**
 * RuleDefinition – a configurable business rule.
 * Supports versioning and enable/disable.
 */
@Entity('rule_definitions')
@Index(['tenantId', 'code', 'version'])
export class RuleDefinition extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @OneToMany(() => RuleCondition, (c) => c.rule, { cascade: true })
  conditions!: RuleCondition[];

  @OneToMany(() => RuleAction, (a) => a.rule, { cascade: true })
  actions!: RuleAction[];
}
