import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('scim_endpoints')
export class ScimEndpoint extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'default_role', type: 'varchar', length: 50, default: 'member' })
  defaultRole!: string;

  @Column({ name: 'organization_code', type: 'varchar', length: 50, default: 'scim' })
  organizationCode!: string;
}
