import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { JobExecutionHistory } from './entities/job-execution-history.entity';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { ScheduledJobRunner } from './scheduled-job.runner';
import { ScheduledJobsController } from './scheduled-jobs.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob, JobExecutionHistory]),
    TenantModule,
    RbacModule,
    AuditModule,
  ],
  controllers: [ScheduledJobsController],
  providers: [ScheduledJobsService, ScheduledJobRunner],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
