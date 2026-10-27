import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('tenant_settings')
@Unique(['tenantId'])
export class TenantSetting extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'varchar', length: 50, default: 'Asia/Ho_Chi_Minh' })
  timezone!: string;

  @Column({ type: 'varchar', length: 10, default: 'VND' })
  currency!: string;

  @Column({ type: 'varchar', length: 10, default: 'vi' })
  language!: string;

  @Column({ name: 'date_format', type: 'varchar', length: 20, default: 'DD/MM/YYYY' })
  dateFormat!: string;

  @Column({ name: 'business_mode', type: 'varchar', length: 20, default: 'business' })
  businessMode!: string;

  @Column({ name: 'accounting_mode', type: 'varchar', length: 20, default: 'standard' })
  accountingMode!: string;

  @Column({ name: 'copilot_enabled', type: 'boolean', default: true })
  copilotEnabled!: boolean;

  @Column({ name: 'notification_enabled', type: 'boolean', default: true })
  notificationEnabled!: boolean;
}
