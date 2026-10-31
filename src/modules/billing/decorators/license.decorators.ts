import { SetMetadata } from '@nestjs/common';
import { PlanFeatureCode } from '../enums/billing.enum';

export const REQUIRE_SUBSCRIPTION_KEY = 'require_subscription';
export const FEATURE_LIMIT_KEY = 'feature_limit';

/**
 * @RequireSubscription()
 * Route requires a valid (non-expired, non-suspended, non-cancelled) subscription.
 */
export const RequireSubscription = () => SetMetadata(REQUIRE_SUBSCRIPTION_KEY, true);

/**
 * @FeatureLimit('USERS' | 'API_KEYS' | 'WEBHOOKS' | 'STORAGE_GB' | 'AI_REQUESTS')
 * Route will be blocked if the tenant has reached the plan limit for this feature.
 */
export const FeatureLimit = (feature: PlanFeatureCode | string) =>
  SetMetadata(FEATURE_LIMIT_KEY, feature);
