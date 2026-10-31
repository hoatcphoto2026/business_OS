import { Entity, Column } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('webhooks')
export class Webhook extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ type: 'jsonb', default: [] })
  events!: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  secret!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string; // active | inactive
}
