import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Observable, from } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { AuditService } from '../audit.service';
import { AUDITED_KEY, AuditedOptions } from '../decorators/audited.decorator';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditActorOverride } from '../audit.types';
import { extractRequestMeta, toAuditSnapshot } from '../audit.serializer';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

const TABLE_BY_ENTITY: Record<string, string> = {
  customer: 'customers',
  product: 'products',
  sales_order: 'sales_orders',
};

/**
 * AuditInterceptor – Sprint 5.
 *
 * Request → Controller → Service → (this, after success) → AuditService → audit_logs
 *
 * Phase 1 only writes when the handler is marked @Audited().
 * The pre-image is loaded before the handler so UPDATE/DELETE still have
 * old_data after the row changes.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const options = this.reflector.getAllAndOverride<AuditedOptions | undefined>(
      AUDITED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const action = options.action ?? this.actionFromMethod(request?.method);
    if (!action) {
      return next.handle();
    }

    const actor = this.captureActor(request);

    return from(this.loadBefore(action, options, request, actor)).pipe(
      concatMap((before) =>
        next.handle().pipe(
          concatMap((body) =>
            from(this.persist(action, options, actor, before, body, request)),
          ),
        ),
      ),
    );
  }

  private actionFromMethod(method?: string): AuditAction | null {
    switch (String(method || '').toUpperCase()) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PUT':
      case 'PATCH':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      default:
        return null;
    }
  }

  private captureActor(request: {
    user?: {
      userId?: string;
      tenantId?: string;
      companyId?: string | null;
      branchId?: string | null;
    };
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
  }): AuditActorOverride {
    const ctx = this.tenantContext.getContext();
    const user = request.user ?? {};
    const meta = extractRequestMeta(request);
    return {
      tenantId: ctx?.tenantId ?? user.tenantId,
      companyId: ctx?.companyId ?? user.companyId ?? null,
      branchId: ctx?.branchId ?? user.branchId ?? null,
      performedBy: ctx?.userId ?? user.userId ?? null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };
  }

  private async loadBefore(
    action: AuditAction,
    options: AuditedOptions,
    request: { params?: Record<string, string> },
    actor: AuditActorOverride,
  ): Promise<unknown | null> {
    if (action === AuditAction.CREATE) return null;
    const id = request.params?.id;
    if (!id || !actor.tenantId) return null;

    const table = TABLE_BY_ENTITY[options.entityType];
    if (!table) return null;

    const meta = this.dataSource.entityMetadatas.find((item) => item.tableName === table);
    if (!meta) return null;

    const repo = this.dataSource.getRepository(meta.target);
    return repo.findOne({
      where: { id, tenantId: actor.tenantId } as Record<string, string>,
    });
  }

  private async persist(
    action: AuditAction,
    options: AuditedOptions,
    actor: AuditActorOverride,
    before: unknown,
    body: unknown,
    request: { params?: Record<string, string> },
  ): Promise<unknown> {
    try {
      if (action === AuditAction.CREATE) {
        await this.auditService.logCreate(options.entityType, body, actor);
      } else if (action === AuditAction.UPDATE) {
        await this.auditService.logUpdate(options.entityType, before, body, actor);
      } else if (action === AuditAction.DELETE) {
        const fallback = { id: request.params?.id };
        await this.auditService.logDelete(
          options.entityType,
          before ?? fallback,
          actor,
        );
      } else {
        const entityId =
          (before as { id?: string } | null)?.id ??
          (body as { id?: string } | null)?.id ??
          request.params?.id ??
          null;
        await this.auditService.logAction(
          options.entityType,
          entityId,
          action,
          {
            oldData: toAuditSnapshot(before),
            newData: toAuditSnapshot(body),
          },
          actor,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to write audit log: ${message}`);
      throw new InternalServerErrorException('Audit log could not be written');
    }
    return body;
  }
}
