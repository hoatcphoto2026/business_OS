import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../../rbac/entities/user-role.entity';
import { RolePermission } from '../../rbac/entities/role-permission.entity';

const CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_ROLE_CODES = new Set(['owner', 'admin']);

/**
 * AdminOnlyGuard – single source of truth is RBAC.
 * Allows access only when the user has, in the current tenant:
 *   - a role whose code is owner or admin, or
 *   - the permission admin.access
 * JWT.role is intentionally ignored.
 */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  private readonly cache = new Map<string, { ok: boolean; exp: number }>();

  constructor(
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectRepository(RolePermission) private readonly rolePerms: Repository<RolePermission>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string; tenantId?: string } | undefined;

    if (!user?.userId || !user?.tenantId) {
      throw new ForbiddenException('Access denied');
    }

    const key = `${user.tenantId}:${user.userId}`;
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now()) {
      if (!hit.ok) throw new ForbiddenException('Only Owner and Admin can access Administration Center');
      return true;
    }

    const allowed = await this.hasAdminAccess(user.userId, user.tenantId);
    this.cache.set(key, { ok: allowed, exp: Date.now() + CACHE_TTL_MS });
    if (!allowed) {
      throw new ForbiddenException('Only Owner and Admin can access Administration Center');
    }
    return true;
  }

  /** Drop a cached decision after a role or permission change. */
  invalidate(tenantId: string, userId: string) {
    this.cache.delete(`${tenantId}:${userId}`);
  }

  private async hasAdminAccess(userId: string, tenantId: string): Promise<boolean> {
    const assignments = await this.userRoles.find({
      where: { userId },
      relations: ['role'],
    });
    const tenantRoles = assignments.filter((a) => a.role?.tenantId === tenantId);
    if (tenantRoles.some((a) => ADMIN_ROLE_CODES.has(a.role.code.toLowerCase()))) {
      return true;
    }

    const roleIds = tenantRoles.map((a) => a.roleId);
    if (roleIds.length === 0) return false;

    const grants = await this.rolePerms.find({
      where: { roleId: In(roleIds) },
      relations: ['permission'],
    });
    return grants.some((g) => g.permission?.code === 'admin.access');
  }
}
