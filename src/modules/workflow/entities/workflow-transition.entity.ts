import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { WorkflowDefinition } from './workflow-definition.entity';
import { WorkflowNode } from './workflow-node.entity';

/**
 * WorkflowTransition – edge between nodes.
 */
@Entity('workflow_transitions')
@Index(['definitionId'])
export class WorkflowTransition extends BaseTenantEntity {
  @Column({ name: 'definition_id', type: 'uuid' })
  definitionId!: string;

  @ManyToOne(() => WorkflowDefinition, (d) => d.transitions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'definition_id' })
  definition!: WorkflowDefinition;

  @Column({ name: 'from_node_id', type: 'uuid' })
  fromNodeId!: string;

  @ManyToOne(() => WorkflowNode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_node_id' })
  fromNode!: WorkflowNode;

  @Column({ name: 'to_node_id', type: 'uuid' })
  toNodeId!: string;

  @ManyToOne(() => WorkflowNode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_node_id' })
  toNode!: WorkflowNode;

  /** Optional condition expression (simple string for now) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  condition!: string | null;
}
