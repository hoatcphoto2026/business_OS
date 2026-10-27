import { Injectable } from '@nestjs/common';
import { FeatureService } from '../../feature/feature.service';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

/**
 * Reuses Sprint 8 FeatureService.
 */
@Injectable()
export class FeatureManagementService {
  constructor(
    private readonly featureService: FeatureService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    return this.featureService.getTenantFeatures(tenantId);
  }

  async enable(code: string) {
    return this.featureService.enableFeature(code);
  }

  async disable(code: string) {
    return this.featureService.disableFeature(code);
  }
}
