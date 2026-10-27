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

  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.has(permissionCode);
  }

  async getUserPermissions(userId: string): Promise<Set<string>> {
    if (this.cache.has(userId)) {
      return this.cache.get(userId)!;
    }

    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });

    const permissionCodes = new Set<string>();

    for (const ur of userRoles) {
      if (ur.role?.status !== 'active') continue;

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

    this.cache.set(userId, permissionCodes);
    return permissionCodes;
  }

  clearCache(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}
