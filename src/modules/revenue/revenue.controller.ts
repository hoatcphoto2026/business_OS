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
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { RevenueService } from './revenue.service';
import {
  GenerateRevenueSnapshotDto,
  RevenueForecastQueryDto,
  RevenueSegmentQueryDto,
  RevenueSnapshotQueryDto,
  RevenueTrendsQueryDto,
  TopCustomersQueryDto,
} from './dto/revenue.dto';

/**
 * EPIC D2 – Revenue Intelligence.
 * Platform-wide revenue analytics, restricted to platform operators.
 */
@ApiTags('Revenue Intelligence')
@ApiBearerAuth()
@Controller('revenue')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Revenue dashboard: MRR/ARR, segments, forecasts and trends' })
  dashboard() {
    return this.revenue.dashboard();
  }

  @Get('top-customers')
  @ApiOperation({ summary: 'Top customers by MRR with share of revenue' })
  topCustomers(@Query() query: TopCustomersQueryDto) {
    return this.revenue.topCustomers(query);
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Next month / quarter / annual revenue forecast' })
  forecast(@Query() query: RevenueForecastQueryDto) {
    return this.revenue.forecast(query);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Revenue, MRR and upgrade/downgrade trends by month' })
  trends(@Query() query: RevenueTrendsQueryDto) {
    return this.revenue.trends(query);
  }

  @Get('segments')
  @ApiOperation({ summary: 'Revenue segments by plan / tenant / country' })
  segments(@Query() query: RevenueSegmentQueryDto) {
    return this.revenue.listSegments(query);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List revenue snapshots (daily / monthly)' })
  snapshots(@Query() query: RevenueSnapshotQueryDto) {
    return this.revenue.listSnapshots(query);
  }

  @Post('snapshots')
  @ApiOperation({ summary: 'Generate a revenue snapshot + segments + forecasts' })
  generate(@Body() dto: GenerateRevenueSnapshotDto) {
    return this.revenue.generateSnapshot(dto);
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus gauges for revenue intelligence' })
  metrics() {
    return this.revenue.prometheusText();
  }
}
