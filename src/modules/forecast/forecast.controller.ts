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
import { ForecastService } from './forecast.service';
import {
  ForecastHistoryQueryDto,
  ForecastQueryDto,
  RunForecastDto,
} from './dto/forecast.dto';

/** EPIC D7 – Forecast Engine (operator-only, platform-wide). */
@ApiTags('Forecast Engine')
@ApiBearerAuth()
@Controller('forecast')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class ForecastController {
  constructor(private readonly forecast: ForecastService) {}

  @Get()
  @ApiOperation({
    summary: 'Latest forecasts (revenue, growth, churn, usage, tickets) with 30/90/365-day horizons',
  })
  latest(@Query() query: ForecastQueryDto) {
    return this.forecast.latest(query);
  }

  @Post('run')
  @ApiOperation({
    summary: 'Run the forecast engine (moving average / trend / seasonal) for all metrics',
  })
  run(@Body() dto: RunForecastDto) {
    return this.forecast.run(dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Forecast run history (newest first)' })
  history(@Query() query: ForecastHistoryQueryDto) {
    return this.forecast.history(query);
  }

  @Get('models')
  @ApiOperation({ summary: 'List forecast models (metric × method configuration)' })
  models() {
    return this.forecast.listModels();
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus gauges for the forecast engine' })
  metrics() {
    return this.forecast.prometheusText();
  }
}
