import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ScheduleType, JobType } from '../enums/scheduled-job.enum';
import { JobExecutionHistory } from './job-execution-history.entity';

/**
 * ScheduledJob – a recurring automation task.
 */
@Entity('scheduled_jobs')
@Index(['tenantId', 'jobType'])
@Index(['tenantId', 'isEnabled'])
export class ScheduledJob extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({
    name: 'job_type',
    type: 'varchar',
    length: 40,
  })
  jobType!: JobType;

  @Column({
    name: 'schedule_type',
    type: 'varchar',
    length: 20,
    default: ScheduleType.DAILY,
  })
  scheduleType!: ScheduleType;

  /** Cron expression when scheduleType = CRON */
  @Column({ name: 'cron_expression', type: 'varchar', length: 100, nullable: true })
  cronExpression!: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries!: number;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @OneToMany(() => JobExecutionHistory, (h) => h.job)
  executions!: JobExecutionHistory[];
}
