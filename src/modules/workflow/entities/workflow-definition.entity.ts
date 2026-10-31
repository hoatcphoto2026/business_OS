import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { WorkflowType } from '../enums/workflow-definition.enum';
import { WorkflowNode } from './workflow-node.entity';
import { WorkflowTransition } from './workflow-transition.entity';

/**
 * WorkflowDefinition – configurable workflow template.
 * Supports versioning and enable/disable.
 */
@Entity('workflow_definitions')
@Index(['tenantId', 'code', 'version'])
export class WorkflowDefinition extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: WorkflowType.MANUAL,
  })
  type!: WorkflowType;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @OneToMany(() => WorkflowNode, (n) => n.definition, { cascade: true })
  nodes!: WorkflowNode[];

  @OneToMany(() => WorkflowTransition, (t) => t.definition, { cascade: true })
  transitions!: WorkflowTransition[];
}
