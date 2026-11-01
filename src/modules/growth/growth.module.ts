import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';
import { GrowthDataService } from './growth-data.service';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { GrowthSnapshot } from './entities/growth-snapshot.entity';
import { GrowthExperiment } from './entities/growth-experiment.entity';
import { GrowthSegment } from './entities/growth-segment.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC D5 – Growth Intelligence. */
@Module({
  imports: [
    TypeOrmModule.forFeature([GrowthSnapshot, GrowthExperiment, GrowthSegment]),
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [GrowthController],
  providers: [GrowthService, GrowthDataService, PlatformOperatorGuard],
  exports: [GrowthService],
})
export class GrowthModule {}
