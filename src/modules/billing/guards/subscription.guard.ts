import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_SUBSCRIPTION_KEY } from '../decorators/license.decorators';
import { LicenseService } from '../license.service';

/**
 * SubscriptionGuard
 *
 * Guards run before interceptors, so tenantId must come from JWT (request.user),
 * not from TenantContextService (ALS).
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly license: LicenseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId as string | undefined;
    if (!tenantId) {
      throw new ForbiddenException({ error: 'NO_TENANT', message: 'Tenant context required' });
    }

    await this.license.assertValidSubscription(tenantId);
    return true;
  }
}
