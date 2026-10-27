import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@Controller()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Get('features')
  getCatalog() {
    return this.featureService.getCatalog();
  }

  @Get('tenant-features')
  getTenantFeatures() {
    return this.featureService.getTenantFeatures();
  }

  @Post('tenant-features/:featureCode/enable')
  @RequirePermission('feature.manage')
  enable(@Param('featureCode') featureCode: string) {
    return this.featureService.enableFeature(featureCode);
  }

  @Post('tenant-features/:featureCode/disable')
  @RequirePermission('feature.manage')
  disable(@Param('featureCode') featureCode: string) {
    return this.featureService.disableFeature(featureCode);
  }
}
