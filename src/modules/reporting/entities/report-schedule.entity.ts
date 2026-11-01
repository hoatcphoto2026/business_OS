import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  ReportFormat,
  ReportFrequency,
  ReportType,
} from '../enums/reporting.enum';

/** Daily / weekly / monthly report schedule with delivery targets. */
@Entity('report_schedules')
@Unique(['tenantId', 'name'])
@Index(['tenantId', 'enabled'])
export class ReportSchedule extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'report_type', type: 'varchar', length: 40 })
  reportType!: ReportType;

  @Column({ type: 'varchar', length: 10, default: ReportFormat.PDF })
  format!: ReportFormat;

  @Column({ type: 'varchar', length: 10, default: ReportFrequency.WEEKLY })
  frequency!: ReportFrequency;

  @Column({ name: 'delivery_channels', type: 'jsonb', default: [] })
  deliveryChannels!: string[];

  /** Email addresses or user ids, depending on the channel. */
  @Column({ type: 'jsonb', default: [] })
  recipients!: string[];

  @Column({ name: 'webhook_ids', type: 'jsonb', default: [] })
  webhookIds!: string[];

  @Column({ type: 'jsonb', default: {} })
  params!: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt!: Date | null;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @Column({ name: 'last_run_id', type: 'uuid', nullable: true })
  lastRunId!: string | null;
}
