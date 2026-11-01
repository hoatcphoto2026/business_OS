import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutiveController } from './executive.controller';
import { ExecutiveMetricsService } from './executive-metrics.service';
import { ExecutiveSnapshotJob } from './executive-snapshot.job';
import { PlatformOperatorGuard } from './platform-operator.guard';
import { ExecutiveMetric } from './entities/executive-metric.entity';
import { ExecutiveSnapshot } from './entities/executive-snapshot.entity';
import { MetricHistory } from './entities/metric-history.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC D1 – Executive Metrics Platform. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExecutiveMetric,
      ExecutiveSnapshot,
      MetricHistory,
    ]),
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [ExecutiveController],
  providers: [ExecutiveMetricsService, ExecutiveSnapshotJob, PlatformOperatorGuard],
  exports: [ExecutiveMetricsService],
})
export class ExecutiveModule {}
