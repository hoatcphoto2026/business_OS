import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PlatformOperatorGuard } from './platform-operator.guard';
import { ExecutiveMetricsService } from './executive-metrics.service';
import { ExecutiveDashboardService } from './executive-dashboard.service';
import {
  GenerateSnapshotDto,
  MetricHistoryQueryDto,
  SnapshotListQueryDto,
} from './dto/executive.dto';
import {
  ExecutiveAlertsQueryDto,
  ExecutiveDashboardQueryDto,
  ExecutiveWidgetsQueryDto,
} from './executive-dashboard.dto';

/**
 * EPIC D1 – Executive Metrics Platform.
 * Platform-wide KPIs are restricted to operator accounts (PLATFORM_ADMIN_EMAILS).
 */
@ApiTags('Executive Metrics')
@ApiBearerAuth()
@Controller('executive')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class ExecutiveController {
  constructor(
    private readonly executive: ExecutiveMetricsService,
    private readonly dashboardService: ExecutiveDashboardService,
  ) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Live executive KPIs (MRR, ARR, ARPU, LTV, churn, ...)' })
  metrics() {
    return this.executive.latestMetrics();
  }

  @Get('metrics/history')
  @ApiOperation({ summary: 'Metric history / trends (daily or monthly series)' })
  history(@Query() query: MetricHistoryQueryDto) {
    return this.executive.history(query);
  }

  @Get('metrics/prometheus')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus gauges for executive KPIs' })
  prometheus() {
    return this.executive.prometheusText();
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Executive dashboard: KPIs, widgets, alerts, trends (D1 + D6)',
  })
  dashboard(
    @Query() query: ExecutiveDashboardQueryDto,
    @Req() req: any,
  ) {
    return this.dashboardService.dashboard(query, req.user?.role);
  }

  @Get('widgets')
  @ApiOperation({ summary: 'Executive widgets: revenue, growth, customers, compliance, security, automation, operations' })
  widgets(@Query() query: ExecutiveWidgetsQueryDto) {
    return this.dashboardService.widgets(query);
  }

  @Get('widgets/:key')
  @ApiOperation({ summary: 'Widget drill-down (underlying rows + links)' })
  widgetDetail(
    @Query() query: ExecutiveDashboardQueryDto,
    @Req() req: any,
  ) {
    return this.dashboardService.widgetDetail(
      req.params.key as string,
      query,
    );
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Executive alerts: revenue drop, churn spike, security spike, system risk' })
  alerts(@Query() query: ExecutiveAlertsQueryDto) {
    return this.dashboardService.alerts(query);
  }

  @Post('snapshots')
  @ApiOperation({ summary: 'Generate a daily or monthly executive snapshot' })
  generateSnapshot(@Body() dto: GenerateSnapshotDto) {
    return this.executive.generateSnapshot(dto);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List executive snapshots (newest first)' })
  snapshots(@Query() query: SnapshotListQueryDto) {
    return this.executive.listSnapshots(query);
  }
}
