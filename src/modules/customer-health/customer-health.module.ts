import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerHealthController } from './customer-health.controller';
import { HealthAliasController } from './health-alias.controller';
import { CustomerHealthService } from './customer-health.service';
import { HealthSnapshotJob } from './health-snapshot.job';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { CustomerHealthScore } from './entities/customer-health-score.entity';
import { HealthSignal } from './entities/health-signal.entity';
import { HealthSnapshot } from './entities/health-snapshot.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC D3 – Customer Health Platform. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerHealthScore,
      HealthSignal,
      HealthSnapshot,
    ]),
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [CustomerHealthController, HealthAliasController],
  providers: [CustomerHealthService, HealthSnapshotJob, PlatformOperatorGuard],
  exports: [CustomerHealthService],
})
export class CustomerHealthModule {}
