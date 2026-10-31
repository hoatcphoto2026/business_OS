import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { NodeType, WorkflowActionType } from '../enums/workflow-definition.enum';
import { WorkflowDefinition } from './workflow-definition.entity';

/**
 * WorkflowNode – a step in a workflow definition.
 */
@Entity('workflow_nodes')
@Index(['definitionId'])
export class WorkflowNode extends BaseTenantEntity {
  @Column({ name: 'definition_id', type: 'uuid' })
  definitionId!: string;

  @ManyToOne(() => WorkflowDefinition, (d) => d.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'definition_id' })
  definition!: WorkflowDefinition;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    name: 'node_type',
    type: 'varchar',
    length: 20,
    default: NodeType.ACTION,
  })
  nodeType!: NodeType;

  @Column({
    name: 'action_type',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  actionType!: WorkflowActionType | null;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @Column({ name: 'is_start', type: 'boolean', default: false })
  isStart!: boolean;
}
