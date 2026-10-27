import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Feature } from './feature.entity';

@Entity('tenant_features')
@Index(['tenantId', 'featureId'], { unique: true })
export class TenantFeature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId!: string;

  @Index()
  @Column({ name: 'feature_id', type: 'uuid', nullable: false })
  featureId!: string;

  @ManyToOne(() => Feature, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id' })
  feature!: Feature;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ name: 'enabled_at', type: 'timestamptz', nullable: true })
  enabledAt!: Date | null;

  @Column({ name: 'enabled_by', type: 'uuid', nullable: true })
  enabledBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
