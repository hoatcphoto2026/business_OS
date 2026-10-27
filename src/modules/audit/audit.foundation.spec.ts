import 'reflect-metadata';
import { of, lastValueFrom, throwError } from 'rxjs';
import { AuditService } from './audit.service';
import { AuditAction } from './enums/audit-action.enum';
import { AuditLog } from './entities/audit-log.entity';
import { buildAuditScopeClause } from './audit-scope';
import { DataScope } from '../scope/enums/data-scope.enum';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AUDITED_KEY } from './decorators/audited.decorator';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SALES = '11111111-1111-1111-1111-111111111111';
const MANAGER = '22222222-2222-2222-2222-222222222222';
const ADMIN = '33333333-3333-3333-3333-333333333333';
const CUSTOMER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

interface Ctx {
  tenantId: string;
  userId: string;
  role: string;
  companyId: string | null;
  branchId: string | null;
}

function setup() {
  const rows: AuditLog[] = [];
  let ctx: Ctx = {
    tenantId: TENANT_A,
    userId: SALES,
    role: 'sales',
    companyId: 'company-a',
    branchId: 'branch-hcm',
  };
  const scopes = new Map<string, DataScope>();
  const teams = new Map<string, string[] | null>();

  const setScope = (userId: string, resource: string, scope: DataScope) => {
    scopes.set(`${userId}:${resource}`, scope);
  };

  const repo = {
    create: (data: Partial<AuditLog>) => ({ ...data }) as AuditLog,
    save: async (row: AuditLog) => {
      const saved = {
        ...row,
        id: row.id ?? `log-${rows.length + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, rows.length)),
      } as AuditLog;
      rows.push(saved);
      return saved;
    },
    queryBuilder: () => {
      const params: Record<string, any> = {};
      const qb: any = {
        where: (sql: string, extra?: Record<string, unknown>) => {
          Object.assign(params, extra);
          return qb;
        },
        andWhere: (sql: string, extra?: Record<string, unknown>) => {
          Object.assign(params, extra);
          return qb;
        },
        orderBy: () => qb,
        addOrderBy: () => qb,
        take: () => qb,
        getMany: async () => {
          return rows
            .filter((row) => {
              if (row.tenantId !== params.tenantId) return false;
              if (params.entityType && row.entityType !== params.entityType) return false;
              if (params.entityId && row.entityId !== params.entityId) return false;
              if (params.action && row.action !== params.action) return false;
              if (params.performedBy && row.performedBy !== params.performedBy) return false;
              const owner = params[`${row.entityType}Owner`];
              if (owner && row.ownerId !== owner) return false;
              const owners = params[`${row.entityType}Owners`] as string[] | undefined;
              if (owners && row.ownerId && !owners.includes(row.ownerId)) return false;
              return true;
            })
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        },
        params,
      };
      return qb;
    },
  };

  const tenantContext = {
    getContext: () => ctx,
    getCurrentTenantId: () => {
      if (!ctx.tenantId) throw new Error('missing tenant');
      return ctx.tenantId;
    },
    getCurrentUserId: () => {
      if (!ctx.userId) throw new Error('missing user');
      return ctx.userId;
    },
    tryGetCompanyId: () => ctx.companyId,
    tryGetBranchId: () => ctx.branchId,
  };

  const scopeService = {
    getEffectiveScope: async (userId: string, resource: string) =>
      scopes.get(`${userId}:${resource}`) ?? DataScope.SELF,
    resolveTeamOwnerIds: async (userId: string) =>
      teams.has(userId) ? teams.get(userId)! : null,
  };

  const service = new AuditService(
    repo as any,
    tenantContext as any,
    scopeService as any,
  );

  setScope(SALES, 'customer', DataScope.SELF);
  setScope(SALES, 'product', DataScope.SELF);
  setScope(SALES, 'sales_order', DataScope.SELF);
  setScope(SALES, 'audit', DataScope.SELF);
  setScope(MANAGER, 'customer', DataScope.TEAM);
  setScope(MANAGER, 'product', DataScope.TEAM);
  setScope(MANAGER, 'sales_order', DataScope.TEAM);
  setScope(MANAGER, 'audit', DataScope.TEAM);
  setScope(ADMIN, 'customer', DataScope.TENANT);
  setScope(ADMIN, 'product', DataScope.TENANT);
  setScope(ADMIN, 'sales_order', DataScope.TENANT);
  setScope(ADMIN, 'audit', DataScope.TENANT);
  teams.set(MANAGER, [SALES, MANAGER]);

  return {
    service,
    rows,
    setCtx: (next: Partial<Ctx>) => {
      ctx = { ...ctx, ...next };
    },
  };
}

describe('Sprint 5 audit foundation', () => {
  const actor = {
    tenantId: TENANT_A,
    companyId: 'company-a',
    branchId: 'branch-hcm',
    performedBy: SALES,
    ipAddress: '203.0.113.8',
    userAgent: 'jest',
  };

  it('CASE 1 — create customer writes CREATE with new_data only', async () => {
    const { service, rows } = setup();
    await service.logCreate(
      'customer',
      {
        id: CUSTOMER,
        name: 'Cafe Mộc',
        code: 'KH001',
        ownerId: SALES,
        companyId: 'company-a',
        branchId: 'branch-hcm',
      },
      actor,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe(AuditAction.CREATE);
    expect(rows[0].oldData).toBeNull();
    expect(rows[0].newData).toMatchObject({ name: 'Cafe Mộc', code: 'KH001' });
    expect(rows[0].tenantId).toBe(TENANT_A);
    expect(rows[0].performedBy).toBe(SALES);
    expect(rows[0].ownerId).toBe(SALES);
    expect(rows[0].ipAddress).toBe('203.0.113.8');
  });

  it('CASE 2 — update stores old_data and new_data', async () => {
    const { service } = setup();
    const log = await service.logUpdate(
      'customer',
      { id: CUSTOMER, name: 'Cafe Mộc', ownerId: SALES },
      { id: CUSTOMER, name: 'Cafe Mộc Premium', ownerId: SALES },
      actor,
    );

    expect(log.action).toBe(AuditAction.UPDATE);
    expect(log.oldData).toEqual({ name: 'Cafe Mộc' });
    expect(log.newData).toEqual({ name: 'Cafe Mộc Premium' });
  });

  it('CASE 3 — delete stores the previous snapshot', async () => {
    const { service } = setup();
    const log = await service.logDelete(
      'customer',
      { id: CUSTOMER, name: 'Cafe Mộc Premium', code: 'KH001', ownerId: SALES },
      actor,
    );

    expect(log.action).toBe(AuditAction.DELETE);
    expect(log.oldData).toMatchObject({ name: 'Cafe Mộc Premium', code: 'KH001' });
    expect(log.newData).toBeNull();
    expect(log.entityId).toBe(CUSTOMER);
  });

  it('CASE 4 — another tenant cannot see the audit row', async () => {
    const { service, setCtx } = setup();
    await service.logCreate(
      'customer',
      { id: CUSTOMER, name: 'ABC only', ownerId: SALES },
      actor,
    );

    setCtx({ tenantId: TENANT_B, userId: ADMIN, role: 'admin' });
    const visible = await service.query({ entity_type: 'customer', entity_id: CUSTOMER });
    expect(visible).toEqual([]);
  });

  it('CASE 5 — SELF scope hides audits outside the caller’s records', async () => {
    const { service, setCtx } = setup();
    await service.logCreate(
      'customer',
      { id: CUSTOMER, name: 'Owned by manager', ownerId: MANAGER },
      { ...actor, performedBy: MANAGER },
    );

    setCtx({ userId: SALES, role: 'sales' });
    const asSales = await service.query({ entity_type: 'customer' });
    expect(asSales.find((row) => row.entityId === CUSTOMER)).toBeUndefined();

    setCtx({ userId: MANAGER, role: 'manager' });
    const asManager = await service.query({ entity_type: 'customer' });
    expect(asManager.find((row) => row.entityId === CUSTOMER)).toBeDefined();
  });

  it('CASE 6 — entity history is create, then update, then delete', async () => {
    const { service } = setup();
    await service.logCreate(
      'customer',
      { id: CUSTOMER, name: 'Cafe Mộc', code: 'KH001', ownerId: SALES },
      actor,
    );
    await service.logUpdate(
      'customer',
      { id: CUSTOMER, name: 'Cafe Mộc', code: 'KH001', ownerId: SALES },
      { id: CUSTOMER, name: 'Cafe Mộc Premium', code: 'KH001', ownerId: SALES },
      actor,
    );
    await service.logDelete(
      'customer',
      { id: CUSTOMER, name: 'Cafe Mộc Premium', code: 'KH001', ownerId: SALES },
      actor,
    );

    const timeline = await service.query({
      entity_type: 'customer',
      entity_id: CUSTOMER,
    });

    expect(timeline.map((row) => row.action)).toEqual([
      AuditAction.CREATE,
      AuditAction.UPDATE,
      AuditAction.DELETE,
    ]);
    expect(timeline[1].oldData).toEqual({ name: 'Cafe Mộc' });
    expect(timeline[1].newData).toEqual({ name: 'Cafe Mộc Premium' });
    expect(timeline[2].oldData).toMatchObject({ code: 'KH001' });
  });

  it('builds a TEAM owner predicate from the scope engine', async () => {
    const clause = await buildAuditScopeClause({
      userId: MANAGER,
      entityTypes: [{ entityType: 'customer', resource: 'customer' }],
      companyId: 'company-a',
      branchId: null,
      getScope: async () => DataScope.TEAM,
      getTeamOwnerIds: async () => [SALES, MANAGER],
    });

    expect(clause.sql).toContain('owner_id IN');
    expect(clause.params.customerOwners).toEqual([SALES, MANAGER]);
  });

  it('login and logout are session rows for the same user', async () => {
    const { service, rows } = setup();
    await service.logLogin({
      userId: SALES,
      tenantId: TENANT_A,
      companyId: 'company-a',
      branchId: 'branch-hcm',
      ipAddress: '203.0.113.8',
      userAgent: 'jest',
    });
    await service.logLogout({
      userId: SALES,
      tenantId: TENANT_A,
      ipAddress: '203.0.113.8',
      userAgent: 'jest',
    });

    expect(rows.map((row) => row.action)).toEqual([
      AuditAction.LOGIN,
      AuditAction.LOGOUT,
    ]);
    expect(rows.every((row) => row.entityType === 'session')).toBe(true);
    expect(rows.every((row) => row.performedBy === SALES)).toBe(true);
  });
});

describe('AuditInterceptor', () => {
  function httpContext(method: string, params: Record<string, string> = {}) {
    const handler = function handler() {
      return undefined;
    };
    Reflect.defineMetadata(AUDITED_KEY, { entityType: 'customer' }, handler);
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class CustomersController {},
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          params,
          user: {
            userId: SALES,
            tenantId: TENANT_A,
            companyId: 'company-a',
            branchId: 'branch-hcm',
          },
          headers: { 'user-agent': 'jest' },
          ip: '127.0.0.1',
        }),
      }),
    } as any;
  }

  function interceptor(hooks: {
    logCreate?: jest.Mock;
    logUpdate?: jest.Mock;
    logDelete?: jest.Mock;
    before?: unknown;
  }) {
    const reflector = {
      getAllAndOverride: (key: string, targets: any[]) =>
        Reflect.getMetadata(key, targets[0]) ?? Reflect.getMetadata(key, targets[1]),
    };
    const dataSource = {
      entityMetadatas: [{ tableName: 'customers', target: class Customer {} }],
      getRepository: () => ({
        findOne: async () => hooks.before ?? null,
      }),
    };
    const auditService = {
      logCreate: hooks.logCreate ?? jest.fn(),
      logUpdate: hooks.logUpdate ?? jest.fn(),
      logDelete: hooks.logDelete ?? jest.fn(),
      logAction: jest.fn(),
    };
    const tenantContext = { getContext: () => null };
    return {
      interceptor: new AuditInterceptor(
        reflector as any,
        dataSource as any,
        auditService as any,
        tenantContext as any,
      ),
      auditService,
    };
  }

  it('writes CREATE from the response and does not load a pre-image', async () => {
    const logCreate = jest.fn().mockResolvedValue({});
    const { interceptor: audit } = interceptor({ logCreate });
    const body = { id: CUSTOMER, name: 'Cafe Mộc', ownerId: SALES };

    const result = await lastValueFrom(
      audit.intercept(httpContext('POST'), { handle: () => of(body) }),
    );

    expect(result).toEqual(body);
    expect(logCreate).toHaveBeenCalledWith(
      'customer',
      body,
      expect.objectContaining({ tenantId: TENANT_A, performedBy: SALES }),
    );
  });

  it('writes UPDATE with the pre-image and the saved body', async () => {
    const before = { id: CUSTOMER, name: 'Cafe Mộc', ownerId: SALES };
    const after = { id: CUSTOMER, name: 'Cafe Mộc Premium', ownerId: SALES };
    const logUpdate = jest.fn().mockResolvedValue({});
    const { interceptor: audit } = interceptor({ logUpdate, before });

    await lastValueFrom(
      audit.intercept(httpContext('PATCH', { id: CUSTOMER }), {
        handle: () => of(after),
      }),
    );

    expect(logUpdate).toHaveBeenCalledWith(
      'customer',
      before,
      after,
      expect.objectContaining({ performedBy: SALES }),
    );
  });

  it('writes DELETE from the pre-image when the service removes the row', async () => {
    const before = { id: CUSTOMER, name: 'Cafe Mộc', ownerId: SALES };
    const logDelete = jest.fn().mockResolvedValue({});
    const { interceptor: audit } = interceptor({ logDelete, before });

    await lastValueFrom(
      audit.intercept(httpContext('DELETE', { id: CUSTOMER }), {
        handle: () => of({ id: CUSTOMER, deleted: true }),
      }),
    );

    expect(logDelete).toHaveBeenCalledWith(
      'customer',
      before,
      expect.objectContaining({ tenantId: TENANT_A }),
    );
  });

  it('does not audit a failed service call', async () => {
    const logCreate = jest.fn();
    const { interceptor: audit } = interceptor({ logCreate });

    await expect(
      lastValueFrom(
        audit.intercept(httpContext('POST'), {
          handle: () => throwError(() => new Error('db down')),
        }),
      ),
    ).rejects.toThrow('db down');

    expect(logCreate).not.toHaveBeenCalled();
  });
});
