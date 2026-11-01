import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('compliance_snapshots')
@Index(['tenantId', 'generatedAt'])
export class ComplianceSnapshot extends BaseTenantEntity {
  @Column({ name: 'period_start', type: 'timestamptz', nullable: true })
  periodStart!: Date | null;

  @Column({ name: 'period_end', type: 'timestamptz', nullable: true })
  periodEnd!: Date | null;

  @Column({ name: 'evidence_score', type: 'int', default: 0 })
  evidenceScore!: number;

  @Column({ name: 'access_score', type: 'int', default: 0 })
  accessScore!: number;

  @Column({ name: 'risk_score', type: 'int', default: 0 })
  riskScore!: number;

  @Column({ name: 'retention_score', type: 'int', default: 0 })
  retentionScore!: number;

  @Column({ name: 'security_score', type: 'int', default: 0 })
  securityScore!: number;

  @Column({ name: 'overall_score', type: 'int', default: 0 })
  overallScore!: number;

  @Column({ type: 'jsonb', default: {} })
  metrics!: Record<string, unknown>;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
