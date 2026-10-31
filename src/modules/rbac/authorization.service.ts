import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Permission } from './entities/permission.entity';

@Injectable()
export class AuthorizationService {
  private cache = new Map<string, Set<string>>();

  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async hasPermission(
    userId: string,
    permissionCode: string,
    tenantId?: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, tenantId);
    return permissions.has(permissionCode);
  }

  /**
   * Resolve permissions for a user.
   *
   * Roles are tenant-scoped (`roles.tenant_id`), so permissions MUST be resolved
   * for the tenant in the current request context. Passing a tenantId keeps a
   * user who is `admin` in tenant A but `sales` in tenant B from inheriting the
   * higher privileges of tenant A while acting inside tenant B.
   */
  async getUserPermissions(
    userId: string,
    tenantId?: string,
  ): Promise<Set<string>> {
    const cacheKey = tenantId ? `${tenantId}:${userId}` : userId;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });

    const permissionCodes = new Set<string>();

    for (const ur of userRoles) {
      if (!ur.role || ur.role.status !== 'active') continue;
      if (tenantId && ur.role.tenantId !== tenantId) continue;

      const rolePerms = await this.rolePermissionRepo.find({
        where: { roleId: ur.roleId },
        relations: ['permission'],
      });

      for (const rp of rolePerms) {
        if (rp.permission?.code) {
          permissionCodes.add(rp.permission.code);
        }
      }
    }

    this.cache.set(cacheKey, permissionCodes);
    return permissionCodes;
  }

  clearCache(userId?: string): void {
    if (!userId) {
      this.cache.clear();
      return;
    }
    // Drop both the legacy (user-only) key and every tenant-scoped key.
    this.cache.delete(userId);
    for (const key of Array.from(this.cache.keys())) {
      if (key.endsWith(`:${userId}`)) this.cache.delete(key);
    }
  }
}
