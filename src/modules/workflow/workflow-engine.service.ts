import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowInstance } from './entities/workflow-instance.entity';
import { WorkflowHistory } from './entities/workflow-history.entity';
import { WorkflowStatus } from './enums/workflow-status.enum';
import { WorkflowAction } from './enums/workflow-action.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';

/**
 * Allowed transitions – Phase 1 default rules.
 * Future sprints can make this configurable per entity type / tenant.
 */
const TRANSITIONS: Record<WorkflowStatus, Partial<Record<WorkflowAction, WorkflowStatus>>> = {
  [WorkflowStatus.DRAFT]: {
    [WorkflowAction.SUBMIT]: WorkflowStatus.PENDING,
    [WorkflowAction.CANCEL]: WorkflowStatus.CANCELLED,
  },
  [WorkflowStatus.PENDING]: {
    [WorkflowAction.APPROVE]: WorkflowStatus.APPROVED,
    [WorkflowAction.REJECT]: WorkflowStatus.REJECTED,
    [WorkflowAction.CANCEL]: WorkflowStatus.CANCELLED,
  },
  [WorkflowStatus.APPROVED]: {
    [WorkflowAction.POST]: WorkflowStatus.POSTED,
    [WorkflowAction.CANCEL]: WorkflowStatus.CANCELLED,
  },
  [WorkflowStatus.POSTED]: {
    [WorkflowAction.CLOSE]: WorkflowStatus.CLOSED,
  },
  [WorkflowStatus.REJECTED]: {},
  [WorkflowStatus.CANCELLED]: {},
  [WorkflowStatus.CLOSED]: {},
};

/**
 * Permission required for each action + entity type (Phase 1).
 * Falls back to a generic rule if not listed.
 */
const PERMISSION_MAP: Record<string, Partial<Record<WorkflowAction, string>>> = {
  sales_order: {
    [WorkflowAction.SUBMIT]: 'sales.create',
    [WorkflowAction.APPROVE]: 'sales.approve',
    [WorkflowAction.REJECT]: 'sales.approve',
    [WorkflowAction.POST]: 'sales.approve',
    [WorkflowAction.CANCEL]: 'sales.create',
    [WorkflowAction.CLOSE]: 'sales.approve',
  },
  invoice: {
    [WorkflowAction.SUBMIT]: 'invoice.issue',
    [WorkflowAction.APPROVE]: 'invoice.issue',
    [WorkflowAction.REJECT]: 'invoice.issue',
    [WorkflowAction.POST]: 'invoice.issue',
    [WorkflowAction.CANCEL]: 'invoice.issue',
    [WorkflowAction.CLOSE]: 'invoice.issue',
  },
};

const ACTION_TO_AUDIT: Record<WorkflowAction, AuditAction> = {
  [WorkflowAction.SUBMIT]: AuditAction.SUBMIT,
  [WorkflowAction.APPROVE]: AuditAction.APPROVE,
  [WorkflowAction.REJECT]: AuditAction.REJECT,
  [WorkflowAction.POST]: AuditAction.POST,
  [WorkflowAction.CANCEL]: AuditAction.CANCEL,
  [WorkflowAction.CLOSE]: AuditAction.CLOSE,
};

const ACTION_TO_EVENT: Record<WorkflowAction, EventType> = {
  [WorkflowAction.SUBMIT]: EventType.WorkflowSubmitted,
  [WorkflowAction.APPROVE]: EventType.WorkflowApproved,
  [WorkflowAction.REJECT]: EventType.WorkflowRejected,
  [WorkflowAction.POST]: EventType.WorkflowPosted,
  [WorkflowAction.CANCEL]: EventType.WorkflowCancelled,
  [WorkflowAction.CLOSE]: EventType.WorkflowClosed,
};

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    @InjectRepository(WorkflowInstance)
    private readonly instances: Repository<WorkflowInstance>,
    @InjectRepository(WorkflowHistory)
    private readonly histories: Repository<WorkflowHistory>,
    private readonly tenantContext: TenantContextService,
    private readonly authorization: AuthorizationService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Create a new workflow instance for an entity (starts at DRAFT).
   * Idempotent: returns existing instance if one already exists for the entity.
   */
  async createWorkflow(
    entityType: string,
    entityId: string,
    options?: { companyId?: string | null; branchId?: string | null; createdBy?: string | null },
  ): Promise<WorkflowInstance> {
    const ctx = this.tenantContext.getContext();
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context required to create workflow');
    }

    const existing = await this.instances.findOne({
      where: { tenantId, entityType, entityId },
    });
    if (existing) {
      return existing;
    }

    const instance = this.instances.create({
      tenantId,
      companyId: options?.companyId ?? ctx?.companyId ?? null,
      branchId: options?.branchId ?? ctx?.branchId ?? null,
      entityType,
      entityId,
      currentStatus: WorkflowStatus.DRAFT,
      createdBy: options?.createdBy ?? ctx?.userId ?? null,
    });

    const saved = await this.instances.save(instance);

    this.logger.log(`Created workflow ${saved.id} for ${entityType}:${entityId}`);
    return saved;
  }

  async getById(id: string): Promise<WorkflowInstance> {
    const ctx = this.tenantContext.getContext();
    const instance = await this.instances.findOne({
      where: { id, tenantId: ctx?.tenantId },
    });
    if (!instance) {
      throw new NotFoundException('Workflow instance not found');
    }
    return instance;
  }

  async getCurrentStatus(id: string): Promise<WorkflowStatus> {
    const instance = await this.getById(id);
    return instance.currentStatus;
  }

  async getHistory(id: string): Promise<WorkflowHistory[]> {
    await this.getById(id); // tenant check
    return this.histories.find({
      where: { workflowInstanceId: id },
      order: { performedAt: 'ASC' },
    });
  }

  async findByEntity(entityType: string, entityId: string): Promise<WorkflowInstance | null> {
    const ctx = this.tenantContext.getContext();
    return this.instances.findOne({
      where: { tenantId: ctx?.tenantId, entityType, entityId },
    });
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async submit(id: string, comment?: string): Promise<WorkflowInstance> {
    return this.perform(id, WorkflowAction.SUBMIT, comment);
  }

  async approve(id: string, comment?: string): Promise<WorkflowInstance> {
    return this.perform(id, WorkflowAction.APPROVE, comment);
  }

  async reject(id: string, comment?: string): Promise<WorkflowInstance> {
    return this.perform(id, WorkflowAction.REJECT, comment);
  }

  async post(id: string, comment?: string): Promise<WorkflowInstance> {
    return this.perform(id, WorkflowAction.POST, comment);
  }

  async cancel(id: string, comment?: string): Promise<WorkflowInstance> {
    return this.perform(id, WorkflowAction.CANCEL, comment);
  }

  async close(id: string, comment?: string): Promise<WorkflowInstance> {
    return this.perform(id, WorkflowAction.CLOSE, comment);
  }

  private async perform(
    id: string,
    action: WorkflowAction,
    comment?: string,
  ): Promise<WorkflowInstance> {
    const ctx = this.tenantContext.getContext();
    const userId = ctx?.userId;
    if (!userId) {
      throw new ForbiddenException('User context required');
    }

    const instance = await this.getById(id);

    // RBAC check
    const required = this.requiredPermission(instance.entityType, action);
    if (required) {
      const allowed = await this.authorization.hasPermission(
        userId,
        required,
        instance.tenantId,
      );
      if (!allowed) {
        throw new ForbiddenException(
          `Permission '${required}' required for ${action} on ${instance.entityType}`,
        );
      }
    }

    // Transition check
    const nextStatus = TRANSITIONS[instance.currentStatus]?.[action];
    if (!nextStatus) {
      throw new BadRequestException(
        `Cannot ${action} from status ${instance.currentStatus}`,
      );
    }

    const fromStatus = instance.currentStatus;
    instance.currentStatus = nextStatus;
    const updated = await this.instances.save(instance);

    // History
    await this.histories.save(
      this.histories.create({
        workflowInstanceId: instance.id,
        fromStatus,
        toStatus: nextStatus,
        action,
        comment: comment ?? null,
        performedBy: userId,
      }),
    );

    // Audit (who did what)
    await this.auditService.logAction(
      instance.entityType,
      instance.entityId,
      ACTION_TO_AUDIT[action],
      {
        oldData: { workflowStatus: fromStatus, workflowInstanceId: instance.id },
        newData: {
          workflowStatus: nextStatus,
          workflowInstanceId: instance.id,
          action,
          comment: comment ?? null,
        },
        companyId: instance.companyId,
        branchId: instance.branchId,
      },
    );

    // Domain Event (what happened) – separate from Audit
    await this.eventBus.publish(
      ACTION_TO_EVENT[action],
      instance.entityType,
      instance.entityId,
      {
        workflowInstanceId: instance.id,
        fromStatus,
        toStatus: nextStatus,
        action,
        comment: comment ?? null,
      },
      {
        companyId: instance.companyId,
        branchId: instance.branchId,
      },
    );

    this.logger.log(
      `${action} ${instance.entityType}:${instance.entityId} ${fromStatus} → ${nextStatus} by ${userId}`,
    );

    return updated;
  }

  private requiredPermission(entityType: string, action: WorkflowAction): string | null {
    return PERMISSION_MAP[entityType]?.[action] ?? null;
  }
}
