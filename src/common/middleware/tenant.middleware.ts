import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from '../tenant-context/tenant-context.service';

/**
 * Flow (as required):
 * Request → Authentication (Passport JWT) → Tenant Resolver (this middleware)
 *         → Authorization (TenantGuard) → Business Logic
 *
 * This middleware runs AFTER JWT authentication so that request.user is populated.
 * It extracts tenantId from the authenticated user and establishes AsyncLocalStorage context.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user as
      | {
          userId: string;
          tenantId: string;
          role: string;
          companyId?: string | null;
          branchId?: string | null;
          departmentId?: string | null;
        }
      | undefined;

    if (!user) {
      // Public routes that skip auth should also skip this middleware
      // or be registered before the middleware chain.
      this.logger.debug('No authenticated user – skipping tenant context');
      return next();
    }

    if (!user.tenantId) {
      this.logger.warn(
        `Request rejected: missing tenantId for user ${user.userId}`,
      );
      throw new UnauthorizedException('Missing tenantId in token');
    }

    const contextData = {
      tenantId: user.tenantId,
      userId: user.userId,
      role: user.role,
      companyId: user.companyId ?? null,
      branchId: user.branchId ?? null,
      departmentId: user.departmentId ?? null,
      requestId: (req.headers['x-request-id'] as string) || undefined,
    };

    this.logger.debug(
      `Tenant context established: tenant=${contextData.tenantId} user=${contextData.userId}`,
    );

    // Run the rest of the pipeline inside ALS
    TenantContextService.run(contextData, () => next());
  }
}
