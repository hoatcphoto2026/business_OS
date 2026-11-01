import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ScimOperation, ScimProvisionStatus } from '../enums/scim.enum';

@Entity('scim_provisioning_logs')
@Index(['tenantId', 'status'])
export class ScimProvisioningLog extends BaseTenantEntity {
  @Column({ name: 'endpoint_id', type: 'uuid' })
  endpointId!: string;

  @Column({ type: 'varchar', length: 40 })
  operation!: ScimOperation;

  @Column({ type: 'varchar', length: 20 })
  status!: ScimProvisionStatus;

  @Column({ type: 'int', default: 1 })
  attempts!: number;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 128, nullable: true })
  traceId!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'dead_letter_at', type: 'timestamptz', nullable: true })
  deadLetterAt!: Date | null;
}
