import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Role } from '../../rbac/entities/role.entity';
import { DataScope } from '../enums/data-scope.enum';

/**
 * role_scopes – maps a Role + Resource to a DataScope.
 *
 * Example:
 *   Sales      + customer → SELF
 *   Manager    + customer → BRANCH
 *   Director   + customer → COMPANY
 *   Owner      + customer → TENANT
 */
@Entity('role_scopes')
@Unique(['roleId', 'resource'])
export class RoleScope {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  /** Resource name, e.g. "customer", "sales_order", "product" */
  @Column({ type: 'varchar', length: 100 })
  resource!: string;

  @Column({
    type: 'enum',
    enum: DataScope,
    default: DataScope.SELF,
  })
  scope!: DataScope;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
