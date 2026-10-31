import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ExecutionStatus } from '../enums/workflow-definition.enum';
import { WorkflowDefinition } from './workflow-definition.entity';

/**
 * WorkflowExecution – one run of a workflow definition.
 */
@Entity('workflow_executions')
@Index(['tenantId', 'status'])
@Index(['definitionId'])
export class WorkflowExecution extends BaseTenantEntity {
  @Column({ name: 'definition_id', type: 'uuid' })
  definitionId!: string;

  @ManyToOne(() => WorkflowDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'definition_id' })
  definition!: WorkflowDefinition;

  @Column({
    type: 'varchar',
    length: 20,
    default: ExecutionStatus.PENDING,
  })
  status!: ExecutionStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', default: {} })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  output!: Record<string, unknown>;

  @Column({ name: 'current_node_code', type: 'varchar', length: 50, nullable: true })
  currentNodeCode!: string | null;
}
