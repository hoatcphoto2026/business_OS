import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { SecretResourceType } from '../enums/security.enum';

/** Immutable log of every secret/credential rotation. */
@Entity('security_secret_rotations')
@Index(['tenantId', 'resourceType'])
export class SecretRotation extends BaseTenantEntity {
  @Column({ name: 'resource_type', type: 'varchar', length: 40 })
  resourceType!: SecretResourceType;

  @Column({ name: 'resource_id', type: 'varchar', length: 64 })
  resourceId!: string;

  @Column({ name: 'resource_name', type: 'varchar', length: 255, nullable: true })
  resourceName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ name: 'rotated_by', type: 'uuid', nullable: true })
  rotatedBy!: string | null;

  @Column({ name: 'rotated_at', type: 'timestamptz', default: () => 'now()' })
  rotatedAt!: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
