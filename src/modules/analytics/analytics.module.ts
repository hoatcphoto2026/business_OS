import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { KpiService } from './kpi.service';
import { DashboardService } from './dashboard.service';
import { ReportingService } from './reporting.service';
import { ForecastService } from './forecast.service';
import { MetricsService } from './metrics.service';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { Supplier } from '../master-data/entities/supplier.entity';
import { TenantModule } from '../tenant/tenant.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrder, Customer, Product, Supplier]),
    TenantModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    KpiService,
    DashboardService,
    ReportingService,
    ForecastService,
    MetricsService,
    TenantGuard,
  ],
  exports: [KpiService, DashboardService, MetricsService],
})
export class AnalyticsModule {}
