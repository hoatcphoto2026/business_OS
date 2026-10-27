import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('integration_logs')
export class IntegrationLog extends BaseTenantEntity {
  @Column({ name: 'connector_id', type: 'uuid', nullable: true })
  connectorId!: string | null;

  @Column({ name: 'webhook_id', type: 'uuid', nullable: true })
  webhookId!: string | null;

  @Column({ type: 'varchar', length: 20 })
  direction!: string; // inbound | outbound

  @Column({ type: 'varchar', length: 100 })
  event!: string;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status!: string; // success | failed | pending

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  response!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;
}
