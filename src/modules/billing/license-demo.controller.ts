import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { SubscriptionGuard } from './guards/subscription.guard';
import { FeatureLimitGuard } from './guards/feature-limit.guard';
import { RequireSubscription, FeatureLimit } from './decorators/license.decorators';
import { PlanFeatureCode } from './enums/billing.enum';

/**
 * Demo endpoints to exercise License Enforcement.
 * In production these guards are applied to real resource-creation routes.
 */
@ApiTags('License Enforcement (demo)')
@ApiBearerAuth()
@Controller('license-demo')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class LicenseDemoController {
  @Get('protected')
  @UseGuards(SubscriptionGuard)
  @RequireSubscription()
  @ApiOperation({ summary: 'Requires a valid subscription' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'NO_SUBSCRIPTION / EXPIRED / SUSPENDED / CANCELLED' })
  protectedRoute() {
    return { ok: true, message: 'Subscription valid' };
  }

  @Post('users')
  @UseGuards(SubscriptionGuard, FeatureLimitGuard)
  @RequireSubscription()
  @FeatureLimit(PlanFeatureCode.USERS)
  @ApiOperation({ summary: 'Create user – blocked when USERS limit reached' })
  @ApiResponse({ status: 403, description: '{ error: "PLAN_LIMIT_EXCEEDED" }' })
  createUser() {
    return { ok: true, message: 'User creation allowed' };
  }

  @Post('api-keys')
  @UseGuards(SubscriptionGuard, FeatureLimitGuard)
  @RequireSubscription()
  @FeatureLimit(PlanFeatureCode.API_KEYS)
  @ApiOperation({ summary: 'Create API key – blocked when API_KEYS limit reached' })
  @ApiResponse({ status: 403, description: '{ error: "PLAN_LIMIT_EXCEEDED" }' })
  createApiKey() {
    return { ok: true, message: 'API key creation allowed' };
  }
}
