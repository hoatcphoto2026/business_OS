import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { ScopeModule } from '../scope/scope.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ScopeModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [AuditController],
  providers: [AuditLogRepository, AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor, AuditLogRepository],
})
export class AuditModule {}
