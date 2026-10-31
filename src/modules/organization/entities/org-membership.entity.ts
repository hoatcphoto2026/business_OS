import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { OrgMembershipRole } from '../enums/enterprise-org.enum';

@Entity('org_memberships')
@Index(['tenantId', 'organizationId', 'userId'], { unique: true })
export class OrgMembership extends BaseTenantEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'team_id', type: 'uuid', nullable: true })
  teamId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  role!: OrgMembershipRole;
}
