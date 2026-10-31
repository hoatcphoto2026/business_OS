import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoNotificationLog } from './entities/auto-notification-log.entity';
import { AutoNotificationService } from './auto-notification.service';
import { AutoNotificationController } from './auto-notification.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutoNotificationLog]),
    TenantModule,
    RbacModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [AutoNotificationController],
  providers: [AutoNotificationService],
  exports: [AutoNotificationService],
})
export class AutoNotificationModule {}
