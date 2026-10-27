import { Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextData {
  tenantId: string;
  userId: string;
  role: string;
  membershipId?: string;
  requestId?: string;
  // Sprint 2 – Organization Context
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
}

/**
 * TenantContextService – AsyncLocalStorage based.
 *
 * Pros:
 * - Propagates across async boundaries automatically
 * - Services can stay singleton
 * - Clean API: getCurrentTenantId() from anywhere in the request
 *
 * Cons:
 * - Unit tests must wrap with setContext / run
 * - Not available outside HTTP (cron/workers must pass tenantId explicitly)
 */
@Injectable({ scope: Scope.DEFAULT })
export class TenantContextService {
  private static readonly als = new AsyncLocalStorage<TenantContextData>();

  /**
   * Run a function inside a tenant context (used by middleware).
   */
  static run<T>(data: TenantContextData, fn: () => T): T {
    return TenantContextService.als.run(data, fn);
  }

  /**
   * Set / overwrite context for current async chain.
   * Prefer static run() in middleware; this is for explicit control (tests, switch-tenant).
   */
  setContext(data: TenantContextData): void {
    const store = TenantContextService.als.getStore();
    if (store) {
      Object.assign(store, data);
    } else {
      // Outside ALS – cannot set. Callers should use run().
      throw new Error(
        'TenantContext.setContext called outside of an active ALS context. Use TenantContextService.run()',
      );
    }
  }

  clearContext(): void {
    // ALS is cleaned up when the run() callback finishes.
    // This method exists for API completeness / future request-scoped usage.
  }

  getContext(): TenantContextData | null {
    return TenantContextService.als.getStore() ?? null;
  }

  getCurrentTenantId(): string {
    const ctx = this.getContext();
    if (!ctx?.tenantId) {
      throw new Error(
        'TenantContext: tenantId is not available. Ensure TenantMiddleware ran.',
      );
    }
    return ctx.tenantId;
  }

  getCurrentUserId(): string {
    const ctx = this.getContext();
    if (!ctx?.userId) {
      throw new Error(
        'TenantContext: userId is not available. Ensure authentication ran.',
      );
    }
    return ctx.userId;
  }

  getCurrentRole(): string {
    const ctx = this.getContext();
    if (!ctx?.role) {
      throw new Error(
        'TenantContext: role is not available. Ensure authentication ran.',
      );
    }
    return ctx.role;
  }

  tryGetTenantId(): string | null {
    return this.getContext()?.tenantId ?? null;
  }

  tryGetUserId(): string | null {
    return this.getContext()?.userId ?? null;
  }

  // ─── Sprint 2: Organization Context ──────────────────────────

  getCurrentCompanyId(): string | null {
    return this.getContext()?.companyId ?? null;
  }

  getCurrentBranchId(): string | null {
    return this.getContext()?.branchId ?? null;
  }

  getCurrentDepartmentId(): string | null {
    return this.getContext()?.departmentId ?? null;
  }

  tryGetCompanyId(): string | null {
    return this.getContext()?.companyId ?? null;
  }

  tryGetBranchId(): string | null {
    return this.getContext()?.branchId ?? null;
  }

  tryGetDepartmentId(): string | null {
    return this.getContext()?.departmentId ?? null;
  }
}
