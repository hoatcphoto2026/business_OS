import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CustomerHealthService } from './customer-health.service';
import {
  AtRiskQueryDto,
  HealthTrendsQueryDto,
} from './dto/customer-health.dto';

/**
 * EPIC D3 – Customer Health Platform.
 *
 * `/health` is reserved for the public liveness/readiness probes, so the
 * canonical dashboard lives at `/customer-health`. Non-conflicting aliases are
 * also exposed at `/health/dashboard`, `/health/at-risk`, `/health/tenant/:id`.
 */
@ApiTags('Customer Health')
@ApiBearerAuth()
@Controller('customer-health')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class CustomerHealthController {
  constructor(private readonly health: CustomerHealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health dashboard: distribution, tenants, churn candidates' })
  dashboard() {
    return this.health.dashboard();
  }

  @Get('at-risk')
  @ApiOperation({ summary: 'At-risk / churn-candidate tenants sorted by score' })
  atRisk(@Query() query: AtRiskQueryDto) {
    return this.health.atRisk(query);
  }

  @Get('tenant/:id')
  @ApiOperation({ summary: 'Health score detail + history for one tenant' })
  tenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.health.tenantDetail(id);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Daily score trend (all tenants or one tenant)' })
  trends(@Query() query: HealthTrendsQueryDto) {
    return this.health.trends(query);
  }

  @Get('signals')
  @ApiOperation({ summary: 'Signal catalog with weights' })
  signals() {
    return this.health.signals();
  }

  @Post('snapshots')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Score all tenants and persist scores + daily snapshots' })
  snapshot() {
    return this.health.generateSnapshot();
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus gauges for customer health' })
  metrics() {
    return this.health.prometheusText();
  }
}
