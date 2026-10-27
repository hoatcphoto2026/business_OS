import { Injectable, Logger } from '@nestjs/common';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';
import { AuditLogRepository } from './audit.repository';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../scope/scope.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { AuditActorOverride, SessionAuditInput } from './audit.types';
import {
  diffSnapshots,
  endOfRange,
  readUuid,
  startOfRange,
  toAuditSnapshot,
  clip,
} from './audit.serializer';
import { buildAuditScopeClause, resourceForEntity } from './audit-scope';

const PHASE1_ENTITY_TYPES = ['customer', 'product', 'sales_order', 'session'] as const;

/**
 * AuditService – Sprint 5 governance writer + reader.
 *
 * Writers stamp tenant / company / branch / performedBy from context
 * (or from an explicit actor snapshot when there is no request context,
 * e.g. login).
 *
 * Readers never accept a client-supplied tenant id.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly auditLogs: AuditLogRepository,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
  ) {}

  async logCreate(
    entityType: string,
    entity: unknown,
    actor?: AuditActorOverride,
  ): Promise<AuditLog> {
    const snapshot = toAuditSnapshot(entity);
    return this.write({
      entityType,
      entityId: readUuid(snapshot?.id),
      action: AuditAction.CREATE,
      oldData: null,
      newData: snapshot,
      ownerId: readUuid(snapshot?.ownerId),
      companyId: readUuid(snapshot?.companyId),
      branchId: readUuid(snapshot?.branchId),
      actor,
    });
  }

  async logUpdate(
    entityType: string,
    before: unknown,
    after: unknown,
    actor?: AuditActorOverride,
  ): Promise<AuditLog> {
    const previous = toAuditSnapshot(before);
    const next = toAuditSnapshot(after);
    const diff = diffSnapshots(previous, next);
    return this.write({
      entityType,
      entityId: readUuid(next?.id) ?? readUuid(previous?.id),
      action: AuditAction.UPDATE,
      oldData: diff.oldData,
      newData: diff.newData,
      ownerId: readUuid(previous?.ownerId) ?? readUuid(next?.ownerId),
      companyId: readUuid(previous?.companyId) ?? readUuid(next?.companyId),
      branchId: readUuid(previous?.branchId) ?? readUuid(next?.branchId),
      actor,
    });
  }

  async logDelete(
    entityType: string,
    before: unknown,
    actor?: AuditActorOverride,
  ): Promise<AuditLog> {
    const snapshot = toAuditSnapshot(before);
    return this.write({
      entityType,
      entityId: readUuid(snapshot?.id),
      action: AuditAction.DELETE,
      oldData: snapshot,
      newData: null,
      ownerId: readUuid(snapshot?.ownerId),
      companyId: readUuid(snapshot?.companyId),
      branchId: readUuid(snapshot?.branchId),
      actor,
    });
  }

  /**
   * Generic action for RESTORE / APPROVE / REJECT / POST / CANCEL
   * and anything Sprint 6 Workflow will emit.
   * oldData / newData are stored as given (already snapshots or diffs).
   */
  async logAction(
    entityType: string,
    entityId: string | null,
    action: AuditAction,
    payload?: {
      oldData?: Record<string, unknown> | null;
      newData?: Record<string, unknown> | null;
      ownerId?: string | null;
      companyId?: string | null;
      branchId?: string | null;
    },
    actor?: AuditActorOverride,
  ): Promise<AuditLog> {
    return this.write({
      entityType,
      entityId,
      action,
      oldData: payload?.oldData ?? null,
      newData: payload?.newData ?? null,
      ownerId: payload?.ownerId ?? null,
      companyId: payload?.companyId ?? null,
      branchId: payload?.branchId ?? null,
      actor,
    });
  }

  async logLogin(input: SessionAuditInput): Promise<AuditLog> {
    return this.write({
      entityType: 'session',
      entityId: input.userId,
      action: AuditAction.LOGIN,
      oldData: null,
      newData: { result: 'success' },
      ownerId: input.userId,
      companyId: input.companyId ?? null,
      branchId: input.branchId ?? null,
      actor: {
        tenantId: input.tenantId,
        companyId: input.companyId ?? null,
        branchId: input.branchId ?? null,
        performedBy: input.userId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async logLogout(input: SessionAuditInput): Promise<AuditLog> {
    return this.write({
      entityType: 'session',
      entityId: input.userId,
      action: AuditAction.LOGOUT,
      oldData: null,
      newData: { result: 'signed_out' },
      ownerId: input.userId,
      companyId: input.companyId ?? null,
      branchId: input.branchId ?? null,
      actor: {
        tenantId: input.tenantId,
        companyId: input.companyId ?? null,
        branchId: input.branchId ?? null,
        performedBy: input.userId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  /**
   * Scoped audit query.
   * Copilot-ready filters: entity history, actor, action, date window.
   */
  async query(query: QueryAuditLogDto): Promise<AuditLog[]> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.getCurrentUserId();

    const qb = this.auditLogs.queryBuilder('audit');
    qb.where('audit.tenant_id = :tenantId', { tenantId });

    if (query.entity_type) {
      qb.andWhere('audit.entity_type = :entityType', {
        entityType: query.entity_type,
      });
    }
    if (query.entity_id) {
      qb.andWhere('audit.entity_id = :entityId', { entityId: query.entity_id });
    }
    if (query.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }
    if (query.performed_by) {
      qb.andWhere('audit.performed_by = :performedBy', {
        performedBy: query.performed_by,
      });
    }
    if (query.from_date) {
      qb.andWhere('audit.created_at >= :fromDate', {
        fromDate: startOfRange(query.from_date),
      });
    }
    if (query.to_date) {
      qb.andWhere('audit.created_at <= :toDate', {
        toDate: endOfRange(query.to_date),
      });
    }

    const entityTypes = query.entity_type
      ? [
          {
            entityType: query.entity_type,
            resource: resourceForEntity(query.entity_type),
          },
        ]
      : PHASE1_ENTITY_TYPES.map((entityType) => ({
          entityType,
          resource: resourceForEntity(entityType),
        }));

    const clause = await buildAuditScopeClause({
      userId,
      entityTypes,
      companyId: this.tenantContext.tryGetCompanyId(),
      branchId: this.tenantContext.tryGetBranchId(),
      getScope: (id, resource) => this.scopeService.getEffectiveScope(id, resource),
      getTeamOwnerIds: (id) => this.scopeService.resolveTeamOwnerIds(id),
    });
    qb.andWhere(clause.sql, clause.params);

    const limit = query.limit ?? 200;
    qb.orderBy('audit.created_at', 'ASC')
      .addOrderBy('audit.id', 'ASC')
      .take(limit);

    return qb.getMany();
  }

  private async write(input: {
    entityType: string;
    entityId: string | null;
    action: AuditAction;
    oldData: Record<string, unknown> | null;
    newData: Record<string, unknown> | null;
    ownerId?: string | null;
    companyId?: string | null;
    branchId?: string | null;
    actor?: AuditActorOverride;
  }): Promise<AuditLog> {
    const actor = this.resolveActor(input.actor);
    const entityId = input.entityId;
    if (!entityId) {
      throw new Error(
        `AuditService: entityId is required for ${input.action} ${input.entityType}`,
      );
    }

    const row = this.auditLogs.create({
      tenantId: actor.tenantId,
      companyId: input.companyId ?? actor.companyId,
      branchId: input.branchId ?? actor.branchId,
      entityType: input.entityType,
      entityId,
      action: input.action,
      oldData: input.oldData,
      newData: input.newData,
      performedBy: actor.performedBy,
      ownerId: input.ownerId ?? actor.performedBy,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    const saved = await this.auditLogs.save(row);
    this.logger.log(
      `${saved.action} ${saved.entityType}:${saved.entityId} by ${saved.performedBy} tenant=${saved.tenantId}`,
    );
    return saved;
  }

  private resolveActor(override?: AuditActorOverride): {
    tenantId: string;
    companyId: string | null;
    branchId: string | null;
    performedBy: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  } {
    const ctx = this.tenantContext.getContext();
    const tenantId = override?.tenantId ?? ctx?.tenantId;
    if (!tenantId) {
      throw new Error(
        'AuditService: tenantId is not available. Pass an actor snapshot or run inside Tenant Context.',
      );
    }

    const performedBy =
      override?.performedBy !== undefined
        ? override.performedBy
        : (ctx?.userId ?? null);

    const companyId =
      override?.companyId !== undefined
        ? override.companyId
        : (ctx?.companyId ?? null);

    const branchId =
      override?.branchId !== undefined
        ? override.branchId
        : (ctx?.branchId ?? null);

    return {
      tenantId,
      companyId: companyId ?? null,
      branchId: branchId ?? null,
      performedBy: performedBy ?? null,
      ipAddress: clip(override?.ipAddress, 64),
      userAgent: clip(override?.userAgent, 512),
    };
  }
}
