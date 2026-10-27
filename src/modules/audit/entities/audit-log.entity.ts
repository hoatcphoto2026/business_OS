import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditAction } from '../enums/audit-action.enum';

/**
 * Append-only governance record.
 *
 * Visibility is NOT a new permission model: queries always pin tenant_id,
 * then apply the Sprint 4 scope of the underlying resource.
 *
 * owner_id is denormalized from the business row at write time so SELF/TEAM
 * still work after the row itself is deleted.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId!: string | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 30 })
  action!: AuditAction;

  @Column({ name: 'old_data', type: 'jsonb', nullable: true })
  oldData!: Record<string, unknown> | null;

  @Column({ name: 'new_data', type: 'jsonb', nullable: true })
  newData!: Record<string, unknown> | null;

  @Index()
  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy!: string | null;

  /**
   * Scope anchor (SELF / TEAM). Not a substitute for tenant_id.
   * Null only for legacy rows; writers always set it.
   */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
