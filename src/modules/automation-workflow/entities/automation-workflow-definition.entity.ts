import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AutomationWorkflowStatus } from '../enums/automation-workflow.enum';

@Entity('automation_workflow_definitions')
@Index(['tenantId', 'name'], { unique: true })
@Index(['tenantId', 'triggerEvent', 'status'])
export class AutomationWorkflowDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'trigger_event', type: 'varchar', length: 100 })
  triggerEvent!: string;

  @Column({ type: 'jsonb', nullable: true })
  conditions!: Record<string, unknown> | null;

  @Column({ type: 'jsonb' })
  steps!: Array<{
    type: string;
    config: Record<string, unknown>;
    onError?: string;
  }>;

  @Column({
    type: 'varchar',
    length: 20,
    default: AutomationWorkflowStatus.DRAFT,
  })
  status!: AutomationWorkflowStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
