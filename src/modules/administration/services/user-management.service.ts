import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TenantUser, MembershipStatus } from '../../tenant/entities/tenant-user.entity';
import { UserRole } from '../../rbac/entities/user-role.entity';
import { Role } from '../../rbac/entities/role.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import * as bcrypt from 'bcryptjs';

const ASSIGNABLE_ROLES = new Set([
  'owner', 'admin', 'manager', 'sales', 'cashier', 'warehouse', 'accountant', 'auditor', 'member',
]);

@Injectable()
export class UserManagementService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(TenantUser) private readonly memberships: Repository<TenantUser>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const memberships = await this.memberships.find({
      where: { tenantId },
      relations: ['user'],
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      fullName: m.user.fullName,
      status: m.status,
      tenantId: m.tenantId,
      role: m.role,
      createdAt: m.createdAt,
    }));
  }

  async get(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const membership = await this.memberships.findOne({
      where: { tenantId, userId: id },
      relations: ['user'],
    });
    if (!membership) throw new NotFoundException('User not found in this tenant');
    return {
      id: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName,
      status: membership.status,
      role: membership.role,
      createdAt: membership.createdAt,
    };
  }

  async create(data: { email: string; fullName: string; password: string; role?: string }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const role = data.role || 'member';
    await this.assertRoleAssignable(tenantId, role);

    let user = await this.users.findOne({ where: { email: data.email } });
    if (user) {
      const existing = await this.memberships.findOne({ where: { tenantId, userId: user.id } });
      if (existing) throw new ConflictException('User already member of this tenant');
    } else {
      const hash = await bcrypt.hash(data.password, 10);
      user = await this.users.save(
        this.users.create({
          email: data.email,
          fullName: data.fullName,
          passwordHash: hash,
          isActive: true,
        }),
      );
    }

    const membership = await this.memberships.save(
      this.memberships.create({
        tenantId,
        userId: user.id,
        role,
        status: MembershipStatus.ACTIVE,
      }),
    );
    await this.syncRbacRole(tenantId, user.id, role);

    await this.auditService.logCreate('user', { id: user.id, email: user.email, fullName: user.fullName });
    await this.eventBus.publish(EventType.UserCreated, 'user', user.id, {
      email: user.email,
      fullName: user.fullName,
      role: membership.role,
    });

    return this.get(user.id);
  }

  async update(id: string, data: Partial<{ fullName: string; role: string; status: MembershipStatus }>) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const membership = await this.memberships.findOne({
      where: { tenantId, userId: id },
      relations: ['user'],
    });
    if (!membership) throw new NotFoundException('User not found');

    if (data.role) await this.assertRoleAssignable(tenantId, data.role);

    const before = { role: membership.role, status: membership.status, fullName: membership.user.fullName };
    const privilegeChanged = (data.role && data.role !== membership.role) || (data.status && data.status !== membership.status);

    if (data.fullName) membership.user.fullName = data.fullName;
    if (data.role) membership.role = data.role;
    if (data.status) membership.status = data.status;

    await this.users.save(membership.user);
    await this.memberships.save(membership);
    if (data.role) await this.syncRbacRole(tenantId, id, data.role);
    if (privilegeChanged) await this.users.increment({ id }, 'tokenVersion', 1);

    await this.auditService.logUpdate('user', before, {
      id: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName,
      role: membership.role,
      status: membership.status,
    });
    await this.eventBus.publish(EventType.UserUpdated, 'user', id, { changes: data });

    return this.get(id);
  }

  async remove(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const membership = await this.memberships.findOne({ where: { tenantId, userId: id } });
    if (!membership) throw new NotFoundException('User not found');

    await this.memberships.remove(membership);
    await this.users.increment({ id }, 'tokenVersion', 1);
    await this.auditService.logAction('user', id, AuditAction.DELETE, { newData: { removed: true } });

    return { deleted: true };
  }

  private async assertRoleAssignable(tenantId: string, role: string) {
    if (!ASSIGNABLE_ROLES.has(role)) {
      throw new ForbiddenException('Role is not assignable');
    }
    if (role === 'owner' && !(await this.actorIsOwner(tenantId))) {
      throw new ForbiddenException('Only an owner can assign the owner role');
    }
  }

  private async actorIsOwner(tenantId: string): Promise<boolean> {
    const actorId = this.tenantContext.tryGetUserId();
    if (!actorId) return false;
    const links = await this.userRoles.find({ where: { userId: actorId }, relations: ['role'] });
    return links.some((l) => l.role?.tenantId === tenantId && l.role.code === 'owner');
  }

  private async syncRbacRole(tenantId: string, userId: string, roleCode: string) {
    const role = await this.roles.findOne({ where: { tenantId, code: roleCode } });
    if (!role) return;
    const existing = await this.userRoles.findOne({ where: { userId, roleId: role.id } });
    if (!existing) {
      await this.userRoles.save(this.userRoles.create({ userId, roleId: role.id }));
    }
  }
}
