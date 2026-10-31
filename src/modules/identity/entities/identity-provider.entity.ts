import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { IdentityProviderType } from '../enums/identity.enum';

@Entity('identity_providers')
@Index(['tenantId', 'code'], { unique: true })
export class IdentityProvider extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: IdentityProviderType;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 500 })
  issuer!: string;

  @Column({ name: 'client_id', type: 'varchar', length: 255 })
  clientId!: string;

  @Column({ name: 'client_secret', type: 'varchar', length: 500 })
  clientSecret!: string;

  @Column({ name: 'entra_tenant_id', type: 'varchar', length: 100, nullable: true })
  entraTenantId!: string | null;

  @Column({ name: 'redirect_uri', type: 'varchar', length: 500 })
  redirectUri!: string;

  @Column({ name: 'default_role', type: 'varchar', length: 50, default: 'member' })
  defaultRole!: string;

  @Column({ name: 'rbac_role_code', type: 'varchar', length: 50, nullable: true })
  rbacRoleCode!: string | null;

  @Column({ name: 'saml_entity_id', type: 'varchar', length: 500, nullable: true })
  samlEntityId!: string | null;

  @Column({ name: 'saml_acs_url', type: 'varchar', length: 500, nullable: true })
  samlAcsUrl!: string | null;
}
