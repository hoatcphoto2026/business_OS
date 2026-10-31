import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_LIMIT_KEY } from '../decorators/license.decorators';
import { LicenseService } from '../license.service';

/**
 * FeatureLimitGuard
 *
 * Checks that the tenant has not exceeded the plan limit for the annotated feature.
 * Returns 403 { error: "PLAN_LIMIT_EXCEEDED" } when over limit.
 */
@Injectable()
export class FeatureLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly license: LicenseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId as string | undefined;
    if (!tenantId) {
      throw new ForbiddenException({ error: 'NO_TENANT', message: 'Tenant context required' });
    }

    await this.license.assertWithinLimit(tenantId, feature);
    return true;
  }
}
