import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Usage Tracking')
@ApiBearerAuth()
@Controller('billing/usage')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @ApiOperation({ summary: 'Usage overview (current day totals)' })
  overview() {
    return this.usage.getCurrent();
  }

  @Get('current')
  @ApiOperation({ summary: 'Current day usage by metric' })
  current() {
    return this.usage.getCurrent();
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Monthly aggregated usage' })
  @ApiQuery({ name: 'month', required: false, example: '2026-10' })
  monthly(@Query('month') month?: string) {
    return this.usage.getMonthly(month);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for usage' })
  metrics() {
    return this.usage.getPrometheusText();
  }
}
