import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
import { ProductAnalyticsService } from './product-analytics.service';
import {
  FeatureAdoptionQueryDto,
  FeatureTrendQueryDto,
  FeatureUsageWindowDto,
  TrackFeatureUsageDto,
} from './dto/product-analytics.dto';

/**
 * EPIC D4 – Product Analytics. Shares the `/analytics` prefix with the tenant
 * analytics controller but only adds new paths; all routes are operator-only.
 */
@ApiTags('Product Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class ProductAnalyticsController {
  constructor(private readonly analytics: ProductAnalyticsService) {}

  @Get('features/catalog')
  @ApiOperation({ summary: 'Feature catalog (11 trackable product features)' })
  catalog() {
    return this.analytics.catalog();
  }

  @Get('features')
  @ApiOperation({ summary: 'Feature ranking: most/least used, activation, retention, growth' })
  features(@Query() query: FeatureUsageWindowDto) {
    return this.analytics.rankings(query);
  }

  @Post('features/track')
  @ApiOperation({ summary: 'Track an explicit feature usage event for the current tenant' })
  track(@Body() dto: TrackFeatureUsageDto) {
    return this.analytics.track(dto);
  }

  @Post('features/collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Derive feature usage from existing business tables (idempotent)' })
  collect(@Query() query: FeatureUsageWindowDto) {
    return this.analytics.collect(query);
  }

  @Get('features/metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus gauges for product analytics' })
  metrics() {
    return this.analytics.prometheusText();
  }

  @Get('adoption')
  @ApiOperation({ summary: 'Feature adoption by tenant / organization / department / plan' })
  adoption(@Query() query: FeatureAdoptionQueryDto) {
    return this.analytics.adoption(query);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Daily feature usage trend with growth and retention' })
  trends(@Query() query: FeatureTrendQueryDto) {
    return this.analytics.trends(query);
  }
}
