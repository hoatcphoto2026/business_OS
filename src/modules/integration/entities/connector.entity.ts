import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('connectors')
export class Connector extends BaseTenantEntity {
  @Index()
  @Column({ type: 'varchar', length: 50 })
  code!: string; // shopee, tiktok_shop, momo, vietqr, bank, einvoice

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  config!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: 'inactive' })
  status!: string; // active | inactive | error
}
