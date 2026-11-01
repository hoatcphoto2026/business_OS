import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  ReportChannel,
  ReportDeliveryStatus,
} from '../enums/reporting.enum';

/** Delivery attempt for a generated report (email / webhook / in-app). */
@Entity('report_deliveries')
@Index(['tenantId', 'runId'])
@Index(['tenantId', 'channel'])
export class ReportDelivery extends BaseTenantEntity {
  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @Column({ type: 'varchar', length: 20 })
  channel!: ReportChannel;

  @Column({ type: 'varchar', length: 255, nullable: true })
  target!: string | null;

  @Column({ type: 'varchar', length: 20 })
  status!: ReportDeliveryStatus;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
