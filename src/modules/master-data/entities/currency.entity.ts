import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';

@Entity('currencies')
export class Currency extends BaseOrganizationEntity {
  @Index()
  @Column({ type: 'varchar', length: 10 })
  code!: string; // ISO 4217

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  symbol!: string | null;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 18, scale: 6, default: 1 })
  exchangeRate!: number;

  @Column({ name: 'is_base', type: 'boolean', default: false })
  isBase!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;
}
