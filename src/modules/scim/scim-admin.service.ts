import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ScimEndpoint } from './entities/scim-endpoint.entity';
import { ScimProvisioningLog } from './entities/scim-provisioning-log.entity';
import { ScimOperation, ScimProvisionStatus } from './enums/scim.enum';
import { ScimProvisioningService } from './scim-provisioning.service';
import { ScimUsersService } from './scim-users.service';
import { ScimGroupsService } from './scim-groups.service';
import { CreateScimEndpointDto } from './dto/scim.dto';
import { scimError } from './scim.errors';
import { ScimContext } from './scim.types';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

export interface ScimEndpointView {
  id: string;
  name: string;
  enabled: boolean;
  defaultRole: string;
  organizationCode: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ScimAdminService {
  private readonly logger = new Logger(ScimAdminService.name);

  constructor(
    @InjectRepository(ScimEndpoint)
    private readonly endpoints: Repository<ScimEndpoint>,
    private readonly provisioning: ScimProvisioningService,
    private readonly users: ScimUsersService,
    private readonly groups: ScimGroupsService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private tenantId(): string {
    return this.tenantContext.getCurrentTenantId();
  }

  private userId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  private view(row: ScimEndpoint): ScimEndpointView {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      defaultRole: row.defaultRole,
      organizationCode: row.organizationCode,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    };
  }

  async createEndpoint(
    dto: CreateScimEndpointDto,
  ): Promise<ScimEndpointView & { token: string }> {
    const tenantId = this.tenantId();
    const token = randomBytes(24).toString('hex');
    const saved = await this.endpoints.save(
      this.endpoints.create({
        tenantId,
        name: dto.name,
        tokenHash: this.hash(token),
        enabled: true,
        defaultRole: dto.defaultRole ?? 'member',
        organizationCode: dto.organizationCode ?? 'scim',
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe('scim_endpoint', saved.id, AuditAction.CREATE, {
      name: saved.name,
      organizationCode: saved.organizationCode,
      defaultRole: saved.defaultRole,
    });
    // The plaintext token is returned exactly once.
    return { ...this.view(saved), token };
  }

  async listEndpoints(): Promise<ScimEndpointView[]> {
    const rows = await this.endpoints.find({
      where: { tenantId: this.tenantId() },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.view(row));
  }

  async updateEndpoint(
    id: string,
    dto: Partial<CreateScimEndpointDto> & { enabled?: boolean },
  ): Promise<ScimEndpointView> {
    const row = await this.endpoints.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) scimError(404, 'SCIM endpoint not found');

    if (dto.name !== undefined) row.name = dto.name;
    if (dto.defaultRole !== undefined) row.defaultRole = dto.defaultRole;
    if (dto.organizationCode !== undefined) row.organizationCode = dto.organizationCode;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    row.updatedBy = this.userId();

    const saved = await this.endpoints.save(row);
    await this.auditSafe('scim_endpoint', saved.id, AuditAction.UPDATE, {
      enabled: saved.enabled,
      defaultRole: saved.defaultRole,
      organizationCode: saved.organizationCode,
    });
    return this.view(saved);
  }

  async rotateToken(id: string): Promise<ScimEndpointView & { token: string }> {
    const row = await this.endpoints.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) scimError(404, 'SCIM endpoint not found');

    const token = randomBytes(24).toString('hex');
    row.tokenHash = this.hash(token);
    row.updatedBy = this.userId();
    const saved = await this.endpoints.save(row);
    await this.auditSafe('scim_endpoint', saved.id, AuditAction.UPDATE, {
      tokenRotated: true,
    });
    return { ...this.view(saved), token };
  }

  async listLogs(
    status?: ScimProvisionStatus,
    limit?: number,
  ): Promise<ScimProvisioningLog[]> {
    return this.provisioning.listLogs(this.tenantId(), status, limit ?? 50);
  }

  async retry(id: string): Promise<ScimProvisioningLog> {
    const tenantId = this.tenantId();
    const log = await this.provisioning.getLog(id, tenantId);
    const retrying = await this.provisioning.beginRetry(log);

    const endpoint = await this.endpoints.findOne({
      where: { id: retrying.endpointId, tenantId },
    });
    if (!endpoint) scimError(404, 'SCIM endpoint not found');
    const ctx: ScimContext = {
      endpoint,
      traceId: retrying.traceId ?? undefined,
      ipAddress: null,
      userAgent: null,
    };

    try {
      await this.dispatch(retrying, ctx);
      await this.provisioning.markSuccess(retrying);
    } catch (error) {
      await this.provisioning.markFailure(retrying, error);
    }
    return retrying;
  }

  async getLog(id: string): Promise<ScimProvisioningLog> {
    return this.provisioning.getLog(id, this.tenantId());
  }

  metricsText(): string {
    return this.provisioning.metricsText();
  }

  private async dispatch(
    log: ScimProvisioningLog,
    ctx: ScimContext,
  ): Promise<unknown> {
    const payload = log.payload ?? {};
    switch (log.operation) {
      case ScimOperation.CREATE_USER:
        return this.users.doCreate(ctx, payload);
      case ScimOperation.UPDATE_USER:
        if (!log.resourceId) {
          scimError(400, 'resourceId is required to retry an update');
        }
        return this.users.doReplace(ctx, log.resourceId, payload);
      case ScimOperation.SUSPEND_USER:
        if (!log.resourceId) {
          scimError(400, 'resourceId is required to retry a suspend');
        }
        return this.users.doPatch(ctx, log.resourceId, payload);
      case ScimOperation.DELETE_USER:
        if (!log.resourceId) {
          scimError(400, 'resourceId is required to retry a delete');
        }
        return this.users.doDelete(ctx, log.resourceId);
      case ScimOperation.GROUP_SYNC:
      case ScimOperation.DEPARTMENT_SYNC:
      case ScimOperation.ORGANIZATION_SYNC:
        return this.groups.doUpsert(ctx, log.resourceId ?? null, payload);
      default:
        scimError(400, `Operation ${log.operation} cannot be retried`);
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async auditSafe(
    entityType: string,
    entityId: string,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction(entityType, entityId, action, { newData: data });
    } catch (error) {
      this.logger.warn(
        `SCIM endpoint audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

