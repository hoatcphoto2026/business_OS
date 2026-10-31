import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { OrgUnitStatus } from '../enums/enterprise-org.enum';

@Entity('enterprise_organizations')
@Index(['tenantId', 'code'], { unique: true })
export class EnterpriseOrganization extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ type: 'varchar', length: 20, default: OrgUnitStatus.ACTIVE })
  status!: OrgUnitStatus;
}
