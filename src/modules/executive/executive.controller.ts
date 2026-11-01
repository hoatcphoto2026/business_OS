import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PlatformOperatorGuard } from './platform-operator.guard';
import { ExecutiveMetricsService } from './executive-metrics.service';
import {
  GenerateSnapshotDto,
  MetricHistoryQueryDto,
  SnapshotListQueryDto,
} from './dto/executive.dto';

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
  constructor(private readonly executive: ExecutiveMetricsService) {}

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
  @ApiOperation({ summary: 'Executive dashboard: KPIs, latest snapshots and trends' })
  dashboard() {
    return this.executive.dashboard();
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
