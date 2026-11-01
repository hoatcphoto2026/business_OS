import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForecastController } from './forecast.controller';
import { ForecastService } from './forecast.service';
import { ForecastDataService } from './forecast-data.service';
import { ForecastModel } from './entities/forecast-model.entity';
import { ForecastRun } from './entities/forecast-run.entity';
import { ForecastResult } from './entities/forecast-result.entity';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC D7 – Forecast Engine. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ForecastModel, ForecastRun, ForecastResult]),
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [ForecastController],
  providers: [ForecastService, ForecastDataService, PlatformOperatorGuard],
  exports: [ForecastService],
})
export class ForecastModule {}
