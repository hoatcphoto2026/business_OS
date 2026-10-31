import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ScimResourceType, ScimSyncTarget } from '../enums/scim.enum';

export interface ScimMemberRef {
  value: string;
  display?: string;
}

@Entity('scim_mappings')
@Index(['endpointId', 'resourceType'])
export class ScimMapping extends BaseTenantEntity {
  @Column({ name: 'endpoint_id', type: 'uuid' })
  endpointId!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: ScimResourceType;

  @Column({ name: 'sync_target', type: 'varchar', length: 20, nullable: true })
  syncTarget!: ScimSyncTarget | null;

  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId!: string | null;

  @Column({ name: 'user_name', type: 'varchar', length: 255, nullable: true })
  userName!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName!: string | null;

  @Column({ name: 'internal_user_id', type: 'uuid', nullable: true })
  internalUserId!: string | null;

  @Column({ name: 'internal_org_id', type: 'uuid', nullable: true })
  internalOrgId!: string | null;

  @Column({ name: 'internal_department_id', type: 'uuid', nullable: true })
  internalDepartmentId!: string | null;

  @Column({ name: 'role_code', type: 'varchar', length: 50, nullable: true })
  roleCode!: string | null;

  @Column({ name: 'department_name', type: 'varchar', length: 255, nullable: true })
  departmentName!: string | null;

  @Column({ name: 'organization_name', type: 'varchar', length: 255, nullable: true })
  organizationName!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'boolean', default: false })
  deleted!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  members!: ScimMemberRef[];
}
