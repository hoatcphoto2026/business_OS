import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';
import { FeatureService } from '../feature.service';

/**
 * FeatureGuard – Sprint 8
 *
 * IMPORTANT: Guards run BEFORE interceptors.
 * TenantContextInterceptor has not run yet, so we must read
 * tenantId from the JWT user attached by JwtAuthGuard, not from ALS.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureService: FeatureService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string; tenantId?: string } | undefined;
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Feature Disabled: no tenant');
    }

    const enabled = await this.featureService.isEnabled(tenantId, required);
    if (!enabled) {
      throw new ForbiddenException(`Feature Disabled: ${required}`);
    }

    return true;
  }
}
