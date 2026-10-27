import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { WorkflowInstance } from '../workflow/entities/workflow-instance.entity';
import { WorkflowStatus } from '../workflow/enums/workflow-status.enum';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { EventLog } from '../event/entities/event-log.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../scope/scope.service';
import { DataScope } from '../scope/enums/data-scope.enum';
import { LoginHistory } from '../administration/entities/login-history.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { FeatureService } from '../feature/feature.service';
import { CopilotIntent } from './copilot.types';

/**
 * QueryEngine – maps Intent → scoped business query.
 * Never talks to the DB without tenant + scope constraints.
 */
@Injectable()
export class QueryEngine {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrders: Repository<SalesOrder>,
    @InjectRepository(WorkflowInstance)
    private readonly workflows: Repository<WorkflowInstance>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(EventLog)
    private readonly eventLogs: Repository<EventLog>,
    @InjectRepository(LoginHistory)
    private readonly loginHistories: Repository<LoginHistory>,
    @InjectRepository(TenantUser)
    private readonly tenantUsers: Repository<TenantUser>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly featureService: FeatureService,
  ) {}

  async execute(intent: CopilotIntent): Promise<Record<string, unknown>> {
    const tenantId = this.tenantContext.getContext()?.tenantId;
    const userId = this.tenantContext.getContext()?.userId;
    if (!tenantId) return { error: 'No tenant context' };

    switch (intent) {
      case CopilotIntent.TOP_DEBT_CUSTOMER:
        return this.topDebtCustomer(tenantId, userId);
      case CopilotIntent.REVENUE_THIS_MONTH:
      case CopilotIntent.MONTHLY_PROFIT:
        return this.revenueThisMonth(tenantId, userId);
      case CopilotIntent.SALES_TODAY:
        return this.salesToday(tenantId, userId);
      case CopilotIntent.PENDING_WORKFLOWS:
        return this.pendingWorkflows(tenantId);
      case CopilotIntent.WORKFLOW_REJECTIONS:
        return this.workflowRejections(tenantId);
      case CopilotIntent.RECENT_EVENTS:
        return this.recentEvents(tenantId);
      case CopilotIntent.RECENT_AUDIT_LOGS:
        return this.recentAudit(tenantId, userId);
      case CopilotIntent.CUSTOMER_COUNT:
        return this.customerCount(tenantId, userId);
      case CopilotIntent.USER_COUNT:
        return this.userCount(tenantId);
      case CopilotIntent.ENABLED_FEATURES:
        return this.enabledFeatures(tenantId);
      case CopilotIntent.TOP_LOGIN_USERS:
        return this.topLoginUsers(tenantId);
      case CopilotIntent.INVENTORY_LOW_STOCK:
        return { message: 'Inventory module not fully wired yet', items: [] };
      default:
        return { message: 'Không hiểu câu hỏi. Thử: "Khách nào nợ nhiều nhất?", "Doanh thu tháng này?", "Có bao nhiêu workflow đang chờ duyệt?"' };
    }
  }

  private async scopeOwnerIds(userId: string | undefined, resource: string): Promise<{
    scope: DataScope;
    ownerIds: string[] | null;
  }> {
    if (!userId) return { scope: DataScope.SELF, ownerIds: [] };
    const scope = await this.scopeService.getEffectiveScope(userId, resource);
    if (scope === DataScope.SELF) return { scope, ownerIds: [userId] };
    if (scope === DataScope.TEAM) {
      const ids = await this.scopeService.resolveTeamOwnerIds(userId);
      return { scope, ownerIds: ids };
    }
    // BRANCH / COMPANY / TENANT → no owner filter
    return { scope, ownerIds: null };
  }

  private async topDebtCustomer(tenantId: string, userId?: string) {
    const { scope, ownerIds } = await this.scopeOwnerIds(userId, 'customer');
    const qb = this.salesOrders
      .createQueryBuilder('so')
      .leftJoin(Customer, 'c', 'c.id = so.customer_id')
      .select('c.id', 'customerId')
      .addSelect('c.name', 'customer')
      .addSelect('SUM(so.total_amount)', 'amount')
      .where('so.tenant_id = :tenantId', { tenantId })
      .andWhere('so.status NOT IN (:...closed)', {
        closed: [WorkflowStatus.CLOSED, WorkflowStatus.CANCELLED],
      })
      .groupBy('c.id')
      .addGroupBy('c.name')
      .orderBy('SUM(so.total_amount)', 'DESC')
      .limit(1);

    if (ownerIds) {
      qb.andWhere('c.owner_id IN (:...ownerIds)', { ownerIds: ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000'] });
    }

    const row = await qb.getRawOne<{ customerId: string; customer: string; amount: string }>();
    return {
      scope,
      customer: row?.customer ?? null,
      amount: row ? Number(row.amount) : 0,
      customerId: row?.customerId ?? null,
    };
  }

  private async revenueThisMonth(tenantId: string, userId?: string) {
    const { scope, ownerIds } = await this.scopeOwnerIds(userId, 'sales_order');
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const qb = this.salesOrders
      .createQueryBuilder('so')
      .select('COALESCE(SUM(so.total_amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'orders')
      .where('so.tenant_id = :tenantId', { tenantId })
      .andWhere('so.created_at >= :start', { start });

    if (ownerIds) {
      qb.andWhere('so.owner_id IN (:...ownerIds)', { ownerIds: ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000'] });
    }

    const row = await qb.getRawOne<{ revenue: string; orders: string }>();
    return {
      scope,
      revenue: Number(row?.revenue ?? 0),
      orders: Number(row?.orders ?? 0),
      period: 'this_month',
    };
  }

  private async salesToday(tenantId: string, userId?: string) {
    const { scope, ownerIds } = await this.scopeOwnerIds(userId, 'sales_order');
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const qb = this.salesOrders
      .createQueryBuilder('so')
      .select('COALESCE(SUM(so.total_amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'count')
      .where('so.tenant_id = :tenantId', { tenantId })
      .andWhere('so.created_at >= :start', { start });

    if (ownerIds) {
      qb.andWhere('so.owner_id IN (:...ownerIds)', { ownerIds: ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000'] });
    }

    const row = await qb.getRawOne<{ revenue: string; count: string }>();
    return {
      scope,
      salesToday: Number(row?.count ?? 0),
      revenueToday: Number(row?.revenue ?? 0),
    };
  }

  private async pendingWorkflows(tenantId: string) {
    const count = await this.workflows.count({
      where: { tenantId, currentStatus: WorkflowStatus.PENDING },
    });
    return { pendingWorkflows: count };
  }

  private async workflowRejections(tenantId: string) {
    const count = await this.workflows.count({
      where: { tenantId, currentStatus: WorkflowStatus.REJECTED },
    });
    return { workflowRejections: count };
  }

  private async recentEvents(tenantId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.eventLogs
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId', { tenantId })
      .andWhere('e.created_at >= :since', { since })
      .getCount();
    const top = await this.eventLogs
      .createQueryBuilder('e')
      .select('e.event_type', 'eventType')
      .addSelect('COUNT(*)', 'cnt')
      .where('e.tenant_id = :tenantId', { tenantId })
      .andWhere('e.created_at >= :since', { since })
      .groupBy('e.event_type')
      .orderBy('COUNT(*)', 'DESC')
      .limit(3)
      .getRawMany<{ eventType: string; cnt: string }>();
    return { recentEvents: count, topEvents: top.map((t) => ({ type: t.eventType, count: Number(t.cnt) })) };
  }

  private async recentAudit(tenantId: string, userId?: string) {
    const { scope, ownerIds } = await this.scopeOwnerIds(userId, 'audit');
    const qb = this.auditLogs
      .createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId })
      .orderBy('a.created_at', 'DESC')
      .take(10);

    if (ownerIds) {
      qb.andWhere('a.owner_id IN (:...ownerIds)', { ownerIds: ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000'] });
    }

    const rows = await qb.getMany();
    return {
      scope,
      recentAuditActivities: rows.length,
      items: rows.map((r) => ({
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        performedBy: r.performedBy,
        at: r.createdAt,
      })),
    };
  }

  private async customerCount(tenantId: string, userId?: string) {
    const { scope, ownerIds } = await this.scopeOwnerIds(userId, 'customer');
    const qb = this.customers
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId });
    if (ownerIds) {
      qb.andWhere('c.owner_id IN (:...ownerIds)', { ownerIds: ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000'] });
    }
    const count = await qb.getCount();
    return { scope, customerCount: count };
  }

  private async userCount(tenantId: string) {
    const count = await this.tenantUsers.count({ where: { tenantId } });
    return { userCount: count };
  }

  private async enabledFeatures(tenantId: string) {
    const features = await this.featureService.getTenantFeatures(tenantId);
    const enabled = features.filter((f) => f.enabled).map((f) => f.code);
    return { enabledFeatures: enabled, count: enabled.length };
  }

  private async topLoginUsers(tenantId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const rows = await this.loginHistories
      .createQueryBuilder('lh')
      .select('lh.user_id', 'userId')
      .addSelect('COUNT(*)', 'cnt')
      .where('lh.tenant_id = :tenantId', { tenantId })
      .andWhere('lh.login_at >= :since', { since })
      .groupBy('lh.user_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(5)
      .getRawMany<{ userId: string; cnt: string }>();
    return { topLoginUsers: rows.map((r) => ({ userId: r.userId, logins: Number(r.cnt) })) };
  }
}
