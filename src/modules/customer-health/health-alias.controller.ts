import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { CustomerHealthService } from './customer-health.service';
import { AtRiskQueryDto } from './dto/customer-health.dto';

/**
 * Requested `/health/*` aliases. `GET /health` and `/health/ready` stay with the
 * public probe controller (guardrail §1.7), so the dashboard alias is
 * `/health/dashboard` instead of the conflicting root path.
 */
@ApiTags('Customer Health')
@ApiBearerAuth()
@Controller('health')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class HealthAliasController {
  constructor(private readonly health: CustomerHealthService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Alias of /customer-health (dashboard)' })
  dashboard() {
    return this.health.dashboard();
  }

  @Get('at-risk')
  @ApiOperation({ summary: 'Alias of /customer-health/at-risk' })
  atRisk(@Query() query: AtRiskQueryDto) {
    return this.health.atRisk(query);
  }

  @Get('tenant/:id')
  @ApiOperation({ summary: 'Alias of /customer-health/tenant/:id' })
  tenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.health.tenantDetail(id);
  }
}
