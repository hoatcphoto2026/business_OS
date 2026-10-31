import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { FeatureGuard } from '../feature/guards/feature.guard';
import { RequireFeature } from '../feature/decorators/require-feature.decorator';

/**
 * Demo protected endpoints for Feature Toggle e2e (Sprint 8).
 * Real accounting/inventory modules come later; these prove the guard.
 */
@Controller()
@UseGuards(JwtAuthGuard, TenantGuard, FeatureGuard)
export class FeatureDemoController {
  @Get('accounting/reports')
  @RequireFeature('accounting')
  accountingReports() {
    return { ok: true, module: 'accounting' };
  }

  @Get('inventory')
  @RequireFeature('inventory')
  inventory() {
    return { ok: true, module: 'inventory' };
  }
}
