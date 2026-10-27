import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from './tenant.entity';
import { User } from '../../users/entities/user.entity';

export enum MembershipStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  SUSPENDED = 'suspended',
  LEFT = 'left',
}

/**
 * TenantUser – membership junction table.
 *
 * A User can belong to MANY tenants.
 * Role here is the membership role for THIS tenant
 * (will evolve into full RBAC in Sprint 3).
 *
 * Unique constraint: (tenant_id, user_id)
 */
@Entity('tenant_users')
@Unique(['tenantId', 'userId'])
export class TenantUser extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * Simple role string for Sprint 1.
   * Sprint 3 will replace with Role entity + Permission.
   */
  @Column({ type: 'varchar', length: 50, default: 'member' })
  role!: string;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    default: MembershipStatus.ACTIVE,
  })
  status!: MembershipStatus;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
