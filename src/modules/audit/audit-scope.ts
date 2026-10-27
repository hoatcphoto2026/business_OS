import { DataScope } from '../scope/enums/data-scope.enum';

export interface AuditEntityRef {
  entityType: string;
  resource: string;
}

export interface AuditScopeClause {
  sql: string;
  params: Record<string, unknown>;
}

export interface AuditScopeDeps {
  alias?: string;
  userId: string;
  entityTypes: AuditEntityRef[];
  companyId: string | null;
  branchId: string | null;
  getScope: (userId: string, resource: string) => Promise<DataScope>;
  getTeamOwnerIds: (userId: string) => Promise<string[] | null>;
}

/**
 * Maps an audit entity_type onto the Sprint 4 scope resource.
 * session (login/logout) uses the dedicated `audit` resource.
 */
export function resourceForEntity(entityType: string): string {
  if (entityType === 'session') return 'audit';
  return entityType;
}

/**
 * Builds the visibility predicate for audit_logs.
 * tenant_id is applied by the caller and is never optional.
 *
 * SELF  → owner_id = current user (the record owner, not "who clicked")
 * TEAM  → owner_id IN team members
 * BRANCH / COMPANY → org columns stamped on the log
 * TENANT → no extra predicate
 */
export async function buildAuditScopeClause(
  deps: AuditScopeDeps,
): Promise<AuditScopeClause> {
  const alias = deps.alias ?? 'audit';
  const parts: string[] = [];
  const params: Record<string, unknown> = {};

  for (const target of deps.entityTypes) {
    const prefix = target.entityType.replace(/[^a-zA-Z0-9]/g, '_');
    const scope = await deps.getScope(deps.userId, target.resource);
    let clause = `${alias}.entity_type = :${prefix}Type`;
    params[`${prefix}Type`] = target.entityType;

    if (scope === DataScope.COMPANY && deps.companyId) {
      clause += ` AND ${alias}.company_id = :${prefix}Company`;
      params[`${prefix}Company`] = deps.companyId;
    } else if (scope === DataScope.BRANCH && deps.branchId) {
      clause += ` AND ${alias}.branch_id = :${prefix}Branch`;
      params[`${prefix}Branch`] = deps.branchId;
    } else if (scope === DataScope.TEAM) {
      const ids = await deps.getTeamOwnerIds(deps.userId);
      const ownerIds = ids && ids.length > 0 ? ids : [deps.userId];
      clause += ` AND ${alias}.owner_id IN (:...${prefix}Owners)`;
      params[`${prefix}Owners`] = ownerIds;
    } else if (scope === DataScope.SELF || scope == null) {
      clause += ` AND ${alias}.owner_id = :${prefix}Owner`;
      params[`${prefix}Owner`] = deps.userId;
    }
    // TENANT: entity_type match only (tenant_id already applied)

    parts.push(`(${clause})`);
  }

  if (parts.length === 0) {
    return {
      sql: `${alias}.owner_id = :fallbackOwner`,
      params: { fallbackOwner: deps.userId },
    };
  }

  return {
    sql: `(${parts.join(' OR ')})`,
    params,
  };
}
