import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantOffboarding } from './entities/tenant-offboarding.entity';
import { OffboardingService } from './offboarding.service';
import { OffboardingController } from './offboarding.controller';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantOffboarding, TenantUser, ApiKey, Subscription]),
    AuditModule,
    NotificationModule,
    TenantModule,
    RbacModule,
  ],
  controllers: [OffboardingController],
  providers: [OffboardingService],
  exports: [OffboardingService],
})
export class OffboardingModule {}
