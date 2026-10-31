import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AutoRenewalService } from './auto-renewal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Auto Renewal')
@ApiBearerAuth()
@Controller('renewals')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('billing.manage')
export class AutoRenewalController {
  constructor(private readonly service: AutoRenewalService) {}

  @Post('process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process due subscription renewals for current tenant' })
  @ApiResponse({ status: 200 })
  process() {
    return this.service.processDueRenewals();
  }

  @Get()
  @ApiOperation({ summary: 'List renewal attempts' })
  list() {
    return this.service.list();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for auto renewal' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a renewal attempt' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }
}
