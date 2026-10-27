import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feature } from './entities/feature.entity';
import { TenantFeature } from './entities/tenant-feature.entity';
import { FeatureService } from './feature.service';
import { FeatureController } from './feature.controller';
import { FeatureDemoController } from './feature-demo.controller';
import { FeatureGuard } from './guards/feature.guard';
import { AuditModule } from '../audit/audit.module';
import { EventModule } from '../event/event.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Feature, TenantFeature]),
    AuditModule,
    EventModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [FeatureController, FeatureDemoController],
  providers: [FeatureService, FeatureGuard],
  exports: [FeatureService, FeatureGuard],
})
export class FeatureModule {}
