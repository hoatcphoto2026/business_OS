import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  AccessReviewScope,
  AccessReviewStatus,
} from '../enums/compliance.enum';

export interface AccessReviewFinding {
  userId: string;
  email: string;
  membershipRole: string;
  membershipStatus: string;
  roles: string[];
  lastLoginAt: string | null;
  flagged: boolean;
  flagReasons: string[];
}

@Entity('compliance_access_reviews')
@Index(['tenantId', 'status'])
export class AccessReview extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: AccessReviewScope.ALL_USERS })
  scope!: AccessReviewScope;

  @Column({ type: 'varchar', length: 20, default: AccessReviewStatus.DRAFT })
  status!: AccessReviewStatus;

  @Column({ name: 'period_start', type: 'timestamptz', nullable: true })
  periodStart!: Date | null;

  @Column({ name: 'period_end', type: 'timestamptz', nullable: true })
  periodEnd!: Date | null;

  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  findings!: AccessReviewFinding[];

  @Column({ name: 'reviewed_count', type: 'int', default: 0 })
  reviewedCount!: number;

  @Column({ name: 'flagged_count', type: 'int', default: 0 })
  flaggedCount!: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
