import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { TenantUser } from '../../tenant/entities/tenant-user.entity';

/**
 * User is a GLOBAL identity (not tenant-scoped).
 *
 * Membership in tenants is expressed via TenantUser junction table.
 * This enables one user to belong to multiple tenants (multi-tenant membership).
 *
 * Example:
 *   User A
 *   ├── ABC Trading   (role: admin)
 *   ├── Cafe Mộc      (role: member)
 *   └── XYZ Retail    (role: accountant)
 */
@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion!: number;

  @OneToMany(() => TenantUser, (tu) => tu.user)
  memberships!: TenantUser[];
}
