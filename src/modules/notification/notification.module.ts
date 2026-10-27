import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationSubscriber } from './subscribers/notification.subscriber';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationTemplate]),
    EventModule,
    TenantModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationSubscriber, TenantGuard],
  exports: [NotificationService],
})
export class NotificationModule {}
