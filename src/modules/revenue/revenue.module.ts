import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';
import { RevenueDataService } from './revenue-data.service';
import { RevenueSnapshotJob } from './revenue-snapshot.job';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { RevenueSnapshot } from './entities/revenue-snapshot.entity';
import { RevenueForecast } from './entities/revenue-forecast.entity';
import { RevenueSegment } from './entities/revenue-segment.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC D2 – Revenue Intelligence. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RevenueSnapshot,
      RevenueForecast,
      RevenueSegment,
    ]),
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [RevenueController],
  providers: [
    RevenueService,
    RevenueDataService,
    RevenueSnapshotJob,
    PlatformOperatorGuard,
  ],
  exports: [RevenueService],
})
export class RevenueModule {}
