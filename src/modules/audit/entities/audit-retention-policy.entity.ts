import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RetentionPolicyCode } from '../enums/audit-category.enum';

@Entity('audit_retention_policies')
@Index(['tenantId', 'code'], { unique: true })
export class AuditRetentionPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 20 })
  code!: RetentionPolicyCode;

  @Column({ type: 'varchar', length: 40 })
  label!: string;

  @Column({ type: 'int', nullable: true })
  days!: number | null;

  @Column({ name: 'is_custom', type: 'boolean', default: false })
  isCustom!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
