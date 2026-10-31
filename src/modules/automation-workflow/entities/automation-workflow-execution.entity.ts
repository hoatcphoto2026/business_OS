import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AutomationExecutionStatus } from '../enums/automation-workflow.enum';
import { AutomationWorkflowInstance } from './automation-workflow-instance.entity';

@Entity('automation_workflow_executions')
@Index(['instanceId', 'stepIndex'])
export class AutomationWorkflowExecution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId!: string;

  @ManyToOne(() => AutomationWorkflowInstance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instance_id' })
  instance?: AutomationWorkflowInstance;

  @Column({ name: 'step_index', type: 'int' })
  stepIndex!: number;

  @Column({ name: 'step_type', type: 'varchar', length: 50 })
  stepType!: string;

  @Column({ name: 'step_config', type: 'jsonb', nullable: true })
  stepConfig!: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: AutomationExecutionStatus.PENDING,
  })
  status!: AutomationExecutionStatus;

  @Column({ type: 'jsonb', nullable: true })
  input!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  output!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'executed_at', type: 'timestamptz', nullable: true })
  executedAt!: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
