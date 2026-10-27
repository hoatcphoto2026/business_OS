/**
 * Data Scope levels – Sprint 4
 *
 * Determines which records a user is allowed to SEE.
 * Independent of RBAC permissions (what they can DO).
 */
export enum DataScope {
  SELF = 'SELF',
  TEAM = 'TEAM',
  BRANCH = 'BRANCH',
  COMPANY = 'COMPANY',
  TENANT = 'TENANT',
}

export const SCOPE_PRIORITY: Record<DataScope, number> = {
  [DataScope.SELF]: 1,
  [DataScope.TEAM]: 2,
  [DataScope.BRANCH]: 3,
  [DataScope.COMPANY]: 4,
  [DataScope.TENANT]: 5,
};
