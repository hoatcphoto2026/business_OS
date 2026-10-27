import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../rbac/entities/role.entity';
import { RolePermission } from '../../rbac/entities/role-permission.entity';
import { Permission } from '../../rbac/entities/permission.entity';
import { UserRole } from '../../rbac/entities/user-role.entity';
import { User } from '../../users/entities/user.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class RoleManagementService {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(RolePermission) private readonly rolePerms: Repository<RolePermission>,
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    return this.roles.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async get(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const role = await this.roles.findOne({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('Role not found');

    const perms = await this.rolePerms.find({
      where: { roleId: id },
      relations: ['permission'],
    });
    const users = await this.userRoles.find({
      where: { roleId: id },
      relations: ['user'],
    });

    return {
      ...role,
      permissions: perms.map((p) => p.permission),
      users: users.map((u) => ({ id: u.user.id, email: u.user.email, fullName: u.user.fullName })),
    };
  }

  async create(data: { code: string; name: string; description?: string }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const exists = await this.roles.findOne({ where: { tenantId, code: data.code } });
    if (exists) throw new ConflictException('Role code already exists');

    const role = await this.roles.save(
      this.roles.create({
        tenantId,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        status: 'active',
      }),
    );

    await this.auditService.logCreate('role', role);
    await this.eventBus.publish(EventType.RoleCreated, 'role', role.id, { code: role.code });

    return role;
  }

  async update(id: string, data: { name?: string; description?: string; status?: string }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const role = await this.roles.findOne({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('Role not found');

    const before = { ...role };
    if (data.name !== undefined) role.name = data.name;
    if (data.description !== undefined) role.description = data.description;
    if (data.status !== undefined) role.status = data.status;
    const saved = await this.roles.save(role);

    await this.auditService.logUpdate('role', before, saved);
    await this.eventBus.publish(EventType.RoleUpdated, 'role', id, { changes: data });

    return saved;
  }

  async remove(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const role = await this.roles.findOne({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('Role not found');

    await this.roles.remove(role);
    await this.auditService.logAction('role', id, 'DELETE' as any, {});
    return { deleted: true };
  }

  async assignPermission(roleId: string, permissionId: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const role = await this.roles.findOne({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException('Role not found');

    const perm = await this.permissions.findOne({ where: { id: permissionId } });
    if (!perm) throw new NotFoundException('Permission not found');

    const exists = await this.rolePerms.findOne({ where: { roleId, permissionId } });
    if (exists) return exists;

    const rp = await this.rolePerms.save(this.rolePerms.create({ roleId, permissionId }));
    await this.auditService.logAction('role', roleId, 'UPDATE' as any, { newData: { assignedPermission: perm.code } });
    await this.bumpTokenVersionsForRole(roleId);
    return rp;
  }

  async revokePermission(roleId: string, permissionId: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const role = await this.roles.findOne({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException('Role not found');

    const rp = await this.rolePerms.findOne({ where: { roleId, permissionId } });
    if (!rp) throw new NotFoundException('Permission not assigned');

    await this.rolePerms.remove(rp);
    await this.auditService.logAction('role', roleId, 'UPDATE' as any, { newData: { revokedPermission: permissionId } });
    await this.bumpTokenVersionsForRole(roleId);
    return { revoked: true };
  }

  private async bumpTokenVersionsForRole(roleId: string) {
    const links = await this.userRoles.find({ where: { roleId } });
    for (const link of links) {
      await this.users.increment({ id: link.userId }, 'tokenVersion', 1);
    }
  }
}
