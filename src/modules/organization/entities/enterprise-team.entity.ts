import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { OrgUnitStatus } from '../enums/enterprise-org.enum';

@Entity('enterprise_teams')
@Index(['tenantId', 'departmentId', 'code'], { unique: true })
export class EnterpriseTeam extends BaseTenantEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: OrgUnitStatus.ACTIVE })
  status!: OrgUnitStatus;
}
