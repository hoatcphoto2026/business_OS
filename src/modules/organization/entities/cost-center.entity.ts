import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { OrgUnitStatus } from '../enums/enterprise-org.enum';

@Entity('cost_centers')
@Index(['tenantId', 'organizationId', 'code'], { unique: true })
export class CostCenter extends BaseTenantEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: OrgUnitStatus.ACTIVE })
  status!: OrgUnitStatus;
}
