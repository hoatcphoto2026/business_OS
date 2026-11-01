import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductAnalyticsController } from './product-analytics.controller';
import { ProductAnalyticsService } from './product-analytics.service';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { FeatureUsage } from './entities/feature-usage.entity';
import { FeatureAdoption } from './entities/feature-adoption.entity';
import { FeatureTrend } from './entities/feature-trend.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC D4 – Product Analytics. */
@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureUsage, FeatureAdoption, FeatureTrend]),
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [ProductAnalyticsController],
  providers: [ProductAnalyticsService, PlatformOperatorGuard],
  exports: [ProductAnalyticsService],
})
export class ProductAnalyticsModule {}
