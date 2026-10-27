import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('copilot_settings')
@Unique(['tenantId'])
export class CopilotSetting extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'mock' })
  provider!: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature!: number;

  @Column({ name: 'max_tokens', type: 'integer', default: 1024 })
  maxTokens!: number;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt!: string | null;
}
