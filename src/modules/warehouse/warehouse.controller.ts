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
import { WarehouseService } from './warehouse.service';
import {
  GenerateWarehouseSnapshotDto,
  RunEtlDto,
  WarehouseFactsQueryDto,
  WarehouseSnapshotQueryDto,
  WarehouseTrendsQueryDto,
} from './dto/warehouse.dto';

/** EPIC D8 – Analytics Warehouse Layer (operator-only). */
@ApiTags('Analytics Warehouse')
@ApiBearerAuth()
@Controller('warehouse')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Get()
  @ApiOperation({
    summary: 'Warehouse overview: 30-day totals, dimensions, trends, latest snapshot',
  })
  overview() {
    return this.warehouse.overview();
  }

  @Post('etl')
  @ApiOperation({ summary: 'Run daily ETL (dimensions + 5 fact tables, idempotent)' })
  runEtl(@Body() dto: RunEtlDto) {
    return this.warehouse.runEtl(dto);
  }

  @Post('snapshots')
  @ApiOperation({ summary: 'Generate a daily/monthly warehouse snapshot' })
  generateSnapshot(@Body() dto: GenerateWarehouseSnapshotDto) {
    return this.warehouse.generateSnapshot(dto);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List warehouse snapshots' })
  snapshots(@Query() query: WarehouseSnapshotQueryDto) {
    return this.warehouse.listSnapshots(query);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Daily trend series + summary for a warehouse metric' })
  trends(@Query() query: WarehouseTrendsQueryDto) {
    return this.warehouse.trends(query);
  }

  @Get('facts')
  @ApiOperation({ summary: 'Query fact rows (revenue/usage/customer/compliance/security)' })
  facts(@Query() query: WarehouseFactsQueryDto) {
    return this.warehouse.facts(query);
  }

  @Get('dimensions')
  @ApiOperation({ summary: 'Dimension catalog: tenants, plans, organizations, departments, dates' })
  dimensions() {
    return this.warehouse.dimensions();
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics for the warehouse' })
  metrics() {
    return this.warehouse.prometheusText();
  }
}
