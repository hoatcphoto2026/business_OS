import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScimProvisioningLog } from './entities/scim-provisioning-log.entity';
import {
  ScimOperation,
  ScimProvisionStatus,
  SCIM_MAX_ATTEMPTS,
} from './enums/scim.enum';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { scimError } from './scim.errors';
import { ScimContext } from './scim.types';

export interface TrackOptions {
  operation: ScimOperation;
  payload: Record<string, unknown>;
  resourceId?: string | null;
}

const AUDIT_ACTION: Record<ScimOperation, AuditAction> = {
  [ScimOperation.CREATE_USER]: AuditAction.CREATE,
  [ScimOperation.UPDATE_USER]: AuditAction.UPDATE,
  [ScimOperation.SUSPEND_USER]: AuditAction.UPDATE,
  [ScimOperation.DELETE_USER]: AuditAction.DELETE,
  [ScimOperation.GROUP_SYNC]: AuditAction.UPDATE,
  [ScimOperation.DEPARTMENT_SYNC]: AuditAction.CREATE,
  [ScimOperation.ORGANIZATION_SYNC]: AuditAction.CREATE,
  [ScimOperation.ROLE_MAP]: AuditAction.UPDATE,
};

/**
 * Provisioning status tracking, retry bookkeeping, DLQ, metrics, tracing and
 * audit writing for SCIM requests (which run without JWT / ALS context, so the
 * endpoint's tenant is always passed explicitly).
 */
@Injectable()
export class ScimProvisioningService {
  private readonly logger = new Logger(ScimProvisioningService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(ScimProvisioningLog)
    private readonly logs: Repository<ScimProvisioningLog>,
    private readonly audit: AuditService,
  ) {}

  async track<T>(
    ctx: ScimContext,
    options: TrackOptions,
    run: () => Promise<T>,
  ): Promise<T> {
    const log = await this.logs.save(
      this.logs.create({
        tenantId: ctx.endpoint.tenantId,
        endpointId: ctx.endpoint.id,
        operation: options.operation,
        status: ScimProvisionStatus.RETRYING,
        attempts: 1,
        resourceId: options.resourceId ?? null,
        payload: options.payload,
        traceId: ctx.traceId ?? null,
        createdBy: null,
      }),
    );
    this.inc(`scim_provisioning_${options.operation.toLowerCase()}_total`);
    this.tagSpan(ctx, options.operation, options.resourceId ?? null);

    try {
      const result = await run();
      await this.markSuccess(log);
      return result;
    } catch (error) {
      await this.markFailure(log, error);
      throw error;
    }
  }

  async markSuccess(log: ScimProvisioningLog): Promise<void> {
    log.status = ScimProvisionStatus.SUCCESS;
    log.error = null;
    log.completedAt = new Date();
    log.deadLetterAt = null;
    await this.logs.save(log);
    this.inc('scim_provisioning_success_total');
    await this.auditLog(log, AuditAction.UPDATE, { result: 'success' });
  }

  async markFailure(log: ScimProvisioningLog, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    log.error = message.slice(0, 2000);
    log.status =
      log.attempts >= SCIM_MAX_ATTEMPTS
        ? ScimProvisionStatus.DEAD
        : ScimProvisionStatus.FAILED;
    if (log.status === ScimProvisionStatus.DEAD) {
      log.deadLetterAt = new Date();
      this.inc('scim_provisioning_dead_total');
    } else {
      this.inc('scim_provisioning_failed_total');
    }
    await this.logs.save(log);
    this.logger.warn(
      `SCIM ${log.operation} failed (attempt ${log.attempts}/${SCIM_MAX_ATTEMPTS}, status ${log.status}): ${message}`,
    );
    await this.auditLog(log, AuditAction.REJECT, {
      attempt: log.attempts,
      status: log.status,
      error: message.slice(0, 500),
    });
  }

  /** Load a log for the current tenant or raise a SCIM 404. */
  async getLog(id: string, tenantId: string): Promise<ScimProvisioningLog> {
    const log = await this.logs.findOne({ where: { id, tenantId } });
    if (!log) scimError(404, 'Provisioning log not found');
    return log;
  }

  async listLogs(
    tenantId: string,
    status?: ScimProvisionStatus,
    limit = 50,
  ): Promise<ScimProvisioningLog[]> {
    return this.logs.find({
      where: status ? { tenantId, status } : { tenantId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** Increment attempts before a manual retry; refuses SUCCESS/DEAD entries. */
  async beginRetry(log: ScimProvisioningLog): Promise<ScimProvisioningLog> {
    if (log.status === ScimProvisionStatus.SUCCESS) {
      scimError(409, 'Provisioning already succeeded', 'mutability');
    }
    if (log.status === ScimProvisionStatus.DEAD) {
      scimError(
        409,
        'Entry is in the dead-letter queue; resolve the cause and create a new request',
        'mutability',
      );
    }
    log.attempts += 1;
    log.status = ScimProvisionStatus.RETRYING;
    log.error = null;
    const saved = await this.logs.save(log);
    this.inc('scim_provisioning_retry_total');
    return saved;
  }

  /** Persist the resource created by a tracked operation (post-hoc id). */
  async attachResource(logId: string, resourceId: string | null): Promise<void> {
    if (!resourceId) return;
    await this.logs.update({ id: logId }, { resourceId });
  }

  metricsText(): string {
    const lines: string[] = [];
    for (const [name, value] of Array.from(this.counters.entries()).sort()) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }
    lines.push('# TYPE scim_provisioning_max_attempts gauge');
    lines.push(`scim_provisioning_max_attempts ${SCIM_MAX_ATTEMPTS}`);
    return `${lines.join('\n')}\n`;
  }

  inc(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  private tagSpan(
    ctx: ScimContext,
    operation: ScimOperation,
    resourceId: string | null,
  ): void {
    try {
      const api = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
      const span = api.trace.getActiveSpan();
      if (!span) return;
      span.setAttribute('scim.operation', operation);
      span.setAttribute('scim.endpoint_id', ctx.endpoint.id);
      span.setAttribute('scim.tenant_id', ctx.endpoint.tenantId);
      if (resourceId) span.setAttribute('scim.resource_id', resourceId);
      if (ctx.traceId) span.setAttribute('scim.trace_id', ctx.traceId);
    } catch {
      this.logger.debug('OpenTelemetry API is not active for this SCIM request');
    }
  }

  private async auditLog(
    log: ScimProvisioningLog,
    action: AuditAction,
    extra: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction(
        'scim_provisioning',
        log.id,
        action,
        {
          newData: {
            operation: log.operation,
            status: log.status,
            attempts: log.attempts,
            resourceId: log.resourceId,
            ...extra,
          },
        },
        {
          tenantId: log.tenantId,
          performedBy: null,
          ipAddress: null,
          userAgent: null,
        },
      );
    } catch (error) {
      this.logger.warn(
        `SCIM audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  auditOperation(
    ctx: ScimContext,
    entityType: string,
    entityId: string | null,
    operation: ScimOperation,
    data: Record<string, unknown>,
  ): void {
    if (!entityId) return;
    void this.audit
      .logAction(
        entityType,
        entityId,
        AUDIT_ACTION[operation],
        { newData: data },
        {
          tenantId: ctx.endpoint.tenantId,
          performedBy: null,
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent ?? null,
        },
      )
      .catch((error: unknown) =>
        this.logger.warn(
          `SCIM audit skipped: ${error instanceof Error ? error.message : error}`,
        ),
      );
  }
}

