/**
 * JWT payload after successful login.
 *
 * Sprint 2: added optional companyId / branchId / departmentId
 * Sprint 3: role will become array of permission codes or roleIds
 * Sprint 4: scope claims can be added without breaking existing tokens
 */
export interface JwtPayload {
  sub: string;       // userId
  tenantId: string;
  role: string;
  email?: string;
  tokenVersion?: number;
  // Sprint 2 – Organization Context (optional)
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  iat?: number;
  exp?: number;
}
