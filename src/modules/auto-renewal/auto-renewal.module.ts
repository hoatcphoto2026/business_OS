import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RenewalAttempt } from './entities/renewal-attempt.entity';
import { AutoRenewalService } from './auto-renewal.service';
import { AutoRenewalController } from './auto-renewal.controller';
import { Subscription } from '../billing/entities/subscription.entity';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RenewalAttempt, Subscription]),
    TenantModule,
    RbacModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [AutoRenewalController],
  providers: [AutoRenewalService],
  exports: [AutoRenewalService],
})
export class AutoRenewalModule {}
