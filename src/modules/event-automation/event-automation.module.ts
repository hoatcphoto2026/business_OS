import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventAutomationLog } from './entities/event-automation-log.entity';
import { EventAutomationService } from './event-automation.service';
import { EventAutomationController } from './event-automation.controller';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventAutomationLog]),
    EventModule,
    TenantModule,
    RbacModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [EventAutomationController],
  providers: [EventAutomationService],
  exports: [EventAutomationService],
})
export class EventAutomationModule {}
