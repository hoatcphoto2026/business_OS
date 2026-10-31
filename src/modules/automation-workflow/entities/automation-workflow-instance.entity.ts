import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AutomationInstanceStatus } from '../enums/automation-workflow.enum';
import { AutomationWorkflowDefinition } from './automation-workflow-definition.entity';

@Entity('automation_workflow_instances')
@Index(['tenantId', 'definitionId'])
@Index(['tenantId', 'status'])
export class AutomationWorkflowInstance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'definition_id', type: 'uuid' })
  definitionId!: string;

  @ManyToOne(() => AutomationWorkflowDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'definition_id' })
  definition?: AutomationWorkflowDefinition;

  @Column({ name: 'trigger_event', type: 'varchar', length: 100 })
  triggerEvent!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 100, nullable: true })
  aggregateType!: string | null;

  @Column({ name: 'aggregate_id', type: 'uuid', nullable: true })
  aggregateId!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: AutomationInstanceStatus.PENDING,
  })
  status!: AutomationInstanceStatus;

  @Column({ name: 'current_step_index', type: 'int', default: 0 })
  currentStepIndex!: number;

  @Column({ type: 'jsonb', nullable: true })
  context!: Record<string, unknown> | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
