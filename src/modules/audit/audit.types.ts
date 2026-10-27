/**
 * Explicit actor snapshot.
 * Passed by the interceptor / auth controller so a log line does not depend
 * on AsyncLocalStorage still being alive when the insert runs.
 */
export interface AuditActorOverride {
  tenantId?: string;
  companyId?: string | null;
  branchId?: string | null;
  performedBy?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SessionAuditInput {
  userId: string;
  tenantId: string;
  companyId?: string | null;
  branchId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}
