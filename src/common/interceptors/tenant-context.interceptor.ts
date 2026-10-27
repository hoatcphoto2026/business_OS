import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../tenant-context/tenant-context.service';

/**
 * Runs AFTER guards (JwtAuthGuard + TenantGuard).
 * Establishes AsyncLocalStorage context for the entire handler execution.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | {
          userId: string;
          tenantId: string;
          role: string;
          companyId?: string | null;
          branchId?: string | null;
          departmentId?: string | null;
        }
      | undefined;

    if (!user?.tenantId || !user?.userId) {
      // Public routes or unauthenticated – let them through without context
      return next.handle();
    }

    const contextData = {
      tenantId: user.tenantId,
      userId: user.userId,
      role: user.role,
      companyId: user.companyId ?? null,
      branchId: user.branchId ?? null,
      departmentId: user.departmentId ?? null,
    };

    return new Observable((subscriber) => {
      TenantContextService.run(contextData, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
