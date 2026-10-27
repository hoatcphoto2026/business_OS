import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { DashboardService } from './dashboard.service';
import { ReportingService } from './reporting.service';
import { ForecastService } from './forecast.service';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AnalyticsController {
  constructor(
    private readonly kpi: KpiService,
    private readonly dashboard: DashboardService,
    private readonly reporting: ReportingService,
    private readonly forecast: ForecastService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('kpis')
  kpis() {
    return this.kpi.getKpis();
  }

  @Get('dashboard')
  dashboardEndpoint() {
    return this.dashboard.getDashboard();
  }

  @Get('reports/revenue')
  revenueReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reporting.revenueReport(from, to);
  }

  @Get('forecast/revenue')
  revenueForecast(@Query('days') days?: string) {
    return this.forecast.revenueForecast(days ? parseInt(days, 10) : 30);
  }

  @Get('metrics')
  metricsEndpoint() {
    return this.metrics.getMetrics();
  }
}
