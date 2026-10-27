import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';

/**
 * Product – Master Data (Phase 2 enhanced)
 */
@Entity('products')
export class Product extends BaseOrganizationEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index()
  @Column({ type: 'varchar', length: 50, nullable: true })
  sku!: string | null;

  @Column({ name: 'unit_price', type: 'decimal', precision: 18, scale: 2, default: 0 })
  unitPrice!: number;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'pcs' })
  unit!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  /** Phase 2 Master Data */
  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId!: string | null;

  @Column({ name: 'default_warehouse_id', type: 'uuid', nullable: true })
  defaultWarehouseId!: string | null;

  @Column({ name: 'tax_id', type: 'uuid', nullable: true })
  taxId!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'min_stock', type: 'decimal', precision: 18, scale: 4, nullable: true })
  minStock!: number | null;

  @Column({ name: 'max_stock', type: 'decimal', precision: 18, scale: 4, nullable: true })
  maxStock!: number | null;

  /** Sprint 4 – owner for Data Scope */
  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;
}
