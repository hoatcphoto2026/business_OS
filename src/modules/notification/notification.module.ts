import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationDeliveryLog } from './entities/notification-delivery-log.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationSubscriber } from './subscribers/notification.subscriber';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationTemplate, NotificationDeliveryLog]),
    EventModule,
    TenantModule,
    RbacModule,
    AuditModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationSubscriber, TenantGuard],
  exports: [NotificationService],
})
export class NotificationModule {}
