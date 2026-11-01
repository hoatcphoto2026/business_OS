import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { RiskSeverity, RiskStatus } from '../enums/compliance.enum';

@Entity('compliance_risks')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'severity'])
export class RiskAssessment extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 40 })
  category!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 20 })
  severity!: RiskSeverity;

  @Column({ type: 'varchar', length: 20, default: RiskStatus.OPEN })
  status!: RiskStatus;

  /** 1..5 – likelihood x impact = score (see service). */
  @Column({ type: 'int', default: 3 })
  likelihood!: number;

  @Column({ type: 'int', default: 3 })
  impact!: number;

  @Column({ type: 'int', default: 9 })
  score!: number;

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  mitigation!: string | null;

  @Column({ name: 'assessed_at', type: 'timestamptz', default: () => 'now()' })
  assessedAt!: Date;
}
