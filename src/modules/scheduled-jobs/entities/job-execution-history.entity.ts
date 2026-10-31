import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { JobExecutionStatus } from '../enums/scheduled-job.enum';
import { ScheduledJob } from './scheduled-job.entity';

/**
 * JobExecutionHistory – one run of a scheduled job.
 */
@Entity('job_execution_histories')
@Index(['jobId', 'status'])
@Index(['tenantId', 'startedAt'])
export class JobExecutionHistory extends BaseTenantEntity {
  @Column({ name: 'job_id', type: 'uuid' })
  jobId!: string;

  @ManyToOne(() => ScheduledJob, (j) => j.executions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job!: ScheduledJob;

  @Column({
    type: 'varchar',
    length: 20,
    default: JobExecutionStatus.PENDING,
  })
  status!: JobExecutionStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', default: {} })
  result!: Record<string, unknown>;
}
