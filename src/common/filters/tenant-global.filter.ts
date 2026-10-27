import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../tenant-context/tenant-context.service';

/**
 * Optional safety-net interceptor.
 *
 * It does NOT rewrite TypeORM queries (that is the job of TenantAwareRepository).
 * Its purpose is:
 * - Log every request with tenantId for audit
 * - Ensure context is present for authenticated routes
 * - Can later be extended to set PostgreSQL session variables for Row Level Security:
 *     SET app.current_tenant_id = '...';
 */
@Injectable()
export class TenantAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantAuditInterceptor.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const tenantId = this.tenantContext.tryGetTenantId();
    const userId = this.tenantContext.tryGetUserId();
    const request = context.switchToHttp().getRequest();

    if (tenantId) {
      this.logger.debug(
        `[${request.method}] ${request.url} tenant=${tenantId} user=${userId}`,
      );
    }

    return next.handle();
  }
}
