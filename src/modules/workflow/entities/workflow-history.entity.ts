import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkflowInstance } from './workflow-instance.entity';
import { WorkflowStatus } from '../enums/workflow-status.enum';
import { WorkflowAction } from '../enums/workflow-action.enum';

/**
 * WorkflowHistory – immutable timeline of every status change.
 * Enables Copilot answers like "SO001 đã qua các bước nào?"
 */
@Entity('workflow_histories')
export class WorkflowHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'workflow_instance_id', type: 'uuid', nullable: false })
  workflowInstanceId!: string;

  @ManyToOne(() => WorkflowInstance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_instance_id' })
  workflowInstance!: WorkflowInstance;

  @Column({ name: 'from_status', type: 'varchar', length: 30, nullable: true })
  fromStatus!: WorkflowStatus | null;

  @Column({ name: 'to_status', type: 'varchar', length: 30, nullable: false })
  toStatus!: WorkflowStatus;

  @Column({ type: 'varchar', length: 30, nullable: false })
  action!: WorkflowAction;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy!: string | null;

  @CreateDateColumn({ name: 'performed_at', type: 'timestamptz' })
  performedAt!: Date;
}
