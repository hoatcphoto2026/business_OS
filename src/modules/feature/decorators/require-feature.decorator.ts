import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'require_feature';

/**
 * @RequireFeature('accounting')
 * Marks a route as requiring the named feature to be enabled for the current tenant.
 */
export const RequireFeature = (featureCode: string) =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureCode);
