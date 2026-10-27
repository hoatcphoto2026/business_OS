import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, SelectQueryBuilder } from 'typeorm';
import { RoleScope } from './entities/role-scope.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { TeamMember } from '../team/entities/team-member.entity';
import { DataScope, SCOPE_PRIORITY } from './enums/data-scope.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

export interface ScopeFilter {
  scope: DataScope;
  /** TypeORM where fragment or raw conditions */
  conditions: Record<string, any>;
  /** For QueryBuilder */
  applyToQueryBuilder?: (qb: SelectQueryBuilder<any>, alias: string) => void;
}

/**
 * ScopeService – Sprint 4
 *
 * Answers: "Which data is this user allowed to SEE?"
 *
 * Independent of RBAC (what they can DO).
 */
@Injectable()
export class ScopeService {
  private readonly logger = new Logger(ScopeService.name);

  constructor(
    @InjectRepository(RoleScope)
    private readonly roleScopeRepo: Repository<RoleScope>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(TeamMember)
    private readonly teamMemberRepo: Repository<TeamMember>,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Resolve the effective DataScope for a user on a resource.
   * Takes the highest priority scope among all roles the user has.
   */
  async getEffectiveScope(userId: string, resource: string): Promise<DataScope> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });

    if (!userRoles.length) {
      return DataScope.SELF; // default safest
    }

    const roleIds = userRoles.map((ur) => ur.roleId);

    const scopes = await this.roleScopeRepo.find({
      where: {
        roleId: In(roleIds),
        resource,
      },
    });

    if (!scopes.length) {
      return DataScope.SELF;
    }

    // Highest priority wins
    let max = DataScope.SELF;
    for (const s of scopes) {
      if (SCOPE_PRIORITY[s.scope] > SCOPE_PRIORITY[max]) {
        max = s.scope;
      }
    }
    return max;
  }

  /**
   * Owner ids visible under TEAM scope.
   * Returns null when the user belongs to no team (caller treats that as SELF).
   * Shared with Audit Log so SELF/TEAM semantics stay in one place.
   */
  async resolveTeamOwnerIds(userId: string): Promise<string[] | null> {
    const myMemberships = await this.teamMemberRepo.find({
      where: { userId },
    });
    const teamIds = myMemberships.map((m) => m.teamId);
    if (teamIds.length === 0) {
      return null;
    }
    const members = await this.teamMemberRepo.find({
      where: { teamId: In(teamIds) },
    });
    return [...new Set(members.map((m) => m.userId))];
  }

  /**
   * Build the filter object / query conditions based on effective scope.
   */
  async getScopeFilter(
    userId: string,
    resource: string,
  ): Promise<ScopeFilter> {
    const scope = await this.getEffectiveScope(userId, resource);
    const tenantId = this.tenantContext.getCurrentTenantId();
    const companyId = this.tenantContext.tryGetCompanyId();
    const branchId = this.tenantContext.tryGetBranchId();

    const conditions: Record<string, any> = { tenantId };
    let teamOwnerIds: string[] = [];

    switch (scope) {
      case DataScope.SELF: {
        conditions.ownerId = userId;
        break;
      }

      case DataScope.TEAM: {
        const ids = await this.resolveTeamOwnerIds(userId);
        if (!ids) {
          conditions.ownerId = userId;
          break;
        }
        teamOwnerIds = ids;
        conditions.ownerId = In(teamOwnerIds);
        break;
      }

      case DataScope.BRANCH: {
        if (branchId) {
          conditions.branchId = branchId;
        } else if (companyId) {
          conditions.companyId = companyId;
        }
        break;
      }

      case DataScope.COMPANY: {
        if (companyId) {
          conditions.companyId = companyId;
        }
        break;
      }

      case DataScope.TENANT:
      default:
        break;
    }

    return {
      scope,
      conditions,
      applyToQueryBuilder: (qb, alias) => {
        qb.andWhere(`${alias}.tenant_id = :tenantId`, { tenantId });

        if (scope === DataScope.SELF) {
          qb.andWhere(`${alias}.owner_id = :ownerId`, { ownerId: userId });
        } else if (scope === DataScope.TEAM) {
          if (teamOwnerIds.length) {
            qb.andWhere(`${alias}.owner_id IN (:...ownerIds)`, { ownerIds: teamOwnerIds });
          } else {
            qb.andWhere(`${alias}.owner_id = :ownerId`, { ownerId: userId });
          }
        } else if (scope === DataScope.BRANCH && branchId) {
          qb.andWhere(`${alias}.branch_id = :branchId`, { branchId });
        } else if (scope === DataScope.COMPANY && companyId) {
          qb.andWhere(`${alias}.company_id = :companyId`, { companyId });
        }
        // TENANT: only tenant_id
      },
    };
  }

  /**
   * Convenience: buildQueryScope for repository integration.
   */
  async buildQueryScope(userId: string, resource: string) {
    return this.getScopeFilter(userId, resource);
  }
}
