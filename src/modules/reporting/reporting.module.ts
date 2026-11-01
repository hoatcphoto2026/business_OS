import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { ReportDataService } from './report-data.service';
import { ReportDeliveryService } from './report-delivery.service';
import { ReportingSchedulerJob } from './reporting-scheduler.job';
import { ReportRun } from './entities/report-run.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportDelivery } from './entities/report-delivery.entity';
import { Webhook } from '../integration/entities/webhook.entity';
import { IntegrationLog } from '../integration/entities/integration-log.entity';
import { NotificationModule } from '../notification/notification.module';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC C7 – Enterprise Reporting Platform. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportRun,
      ReportSchedule,
      ReportDelivery,
      Webhook,
      IntegrationLog,
    ]),
    NotificationModule,
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    ReportDataService,
    ReportDeliveryService,
    ReportingSchedulerJob,
  ],
  exports: [ReportingService],
})
export class ReportingModule {}
