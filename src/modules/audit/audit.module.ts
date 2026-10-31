import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditExport } from './entities/audit-export.entity';
import { AuditRetentionPolicy } from './entities/audit-retention-policy.entity';
import { ComplianceReport } from './entities/compliance-report.entity';
import { User } from '../users/entities/user.entity';
import { AuditLogRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { CompliancePlatformService } from './compliance-platform.service';
import { CompliancePlatformController } from './compliance-platform.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { ScopeModule } from '../scope/scope.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditLog,
      AuditEvent,
      AuditExport,
      AuditRetentionPolicy,
      ComplianceReport,
      User,
    ]),
    ScopeModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [AuditController, CompliancePlatformController],
  providers: [AuditLogRepository, AuditService, AuditInterceptor, CompliancePlatformService],
  exports: [AuditService, AuditInterceptor, AuditLogRepository, CompliancePlatformService],
})
export class AuditModule {}
