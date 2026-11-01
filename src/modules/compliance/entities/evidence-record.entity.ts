import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  EvidenceCategory,
  EvidenceSource,
  EvidenceStatus,
} from '../enums/compliance.enum';

@Entity('compliance_evidence')
@Index(['tenantId', 'code'], { unique: true })
@Index(['tenantId', 'category'])
export class EvidenceRecord extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 60 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 40 })
  category!: EvidenceCategory;

  @Column({ type: 'varchar', length: 20, default: EvidenceSource.MANUAL })
  source!: EvidenceSource;

  @Column({ type: 'varchar', length: 20, default: EvidenceStatus.COLLECTED })
  status!: EvidenceStatus;

  @Column({ name: 'collected_at', type: 'timestamptz', default: () => 'now()' })
  collectedAt!: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil!: Date | null;

  /** sha256 of the canonical payload – proves the evidence was not altered. */
  @Column({ type: 'varchar', length: 64 })
  hash!: string;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
