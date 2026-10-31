import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuspensionRecord } from './entities/suspension-record.entity';
import { AutoSuspensionService } from './auto-suspension.service';
import { AutoSuspensionController } from './auto-suspension.controller';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SuspensionRecord, Tenant, TenantUser, ApiKey]),
    TenantModule,
    RbacModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [AutoSuspensionController],
  providers: [AutoSuspensionService],
  exports: [AutoSuspensionService],
})
export class AutoSuspensionModule {}
