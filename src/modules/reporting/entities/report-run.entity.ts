import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ReportFormat, ReportRunStatus, ReportType } from '../enums/reporting.enum';

/** One generated report (manual run or schedule execution). */
@Entity('report_runs')
@Index(['tenantId', 'reportType'])
@Index(['tenantId', 'createdAt'])
export class ReportRun extends BaseTenantEntity {
  @Column({ name: 'report_type', type: 'varchar', length: 40 })
  reportType!: ReportType;

  @Column({ type: 'varchar', length: 10, default: ReportFormat.JSON })
  format!: ReportFormat;

  @Column({ name: 'period_from', type: 'timestamptz', nullable: true })
  periodFrom!: Date | null;

  @Column({ name: 'period_to', type: 'timestamptz', nullable: true })
  periodTo!: Date | null;

  @Column({ type: 'varchar', length: 20, default: ReportRunStatus.COMPLETED })
  status!: ReportRunStatus;

  @Column({ name: 'row_count', type: 'int', default: 0 })
  rowCount!: number;

  @Column({ type: 'jsonb', default: {} })
  summary!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'schedule_id', type: 'uuid', nullable: true })
  scheduleId!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
