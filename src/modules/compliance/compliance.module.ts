import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceCenterController } from './compliance-center.controller';
import { ComplianceEvidenceService } from './compliance-evidence.service';
import { ComplianceReviewService } from './compliance-review.service';
import { ComplianceCenterService } from './compliance-center.service';
import { EvidenceRecord } from './entities/evidence-record.entity';
import { AccessReview } from './entities/access-review.entity';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { ComplianceSnapshot } from './entities/compliance-snapshot.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TenantModule,
    RbacModule,
    AuditModule,
    TypeOrmModule.forFeature([
      EvidenceRecord,
      AccessReview,
      RiskAssessment,
      ComplianceSnapshot,
    ]),
  ],
  controllers: [ComplianceCenterController],
  providers: [
    ComplianceEvidenceService,
    ComplianceReviewService,
    ComplianceCenterService,
  ],
  exports: [ComplianceEvidenceService, ComplianceCenterService],
})
export class ComplianceModule {}
