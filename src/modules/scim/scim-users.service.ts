import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ScimMapping } from './entities/scim-mapping.entity';
import { User } from '../users/entities/user.entity';
import {
  MembershipStatus,
  TenantUser,
} from '../tenant/entities/tenant-user.entity';
import { Role } from '../rbac/entities/role.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import {
  ScimOperation,
  ScimResourceType,
  SCIM_LIST,
  SCIM_USER_SCHEMA,
  SCIM_ENTERPRISE_USER,
} from './enums/scim.enum';
import { scimError } from './scim.errors';
import { ScimContext, ScimListResult } from './scim.types';
import { ScimProvisioningService } from './scim-provisioning.service';

type ScimBody = Record<string, any>;

@Injectable()
export class ScimUsersService {
  private readonly logger = new Logger(ScimUsersService.name);

  constructor(
    @InjectRepository(ScimMapping)
    private readonly mappings: Repository<ScimMapping>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(TenantUser)
    private readonly memberships: Repository<TenantUser>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    private readonly provisioning: ScimProvisioningService,
  ) {}

  // ─── Read ──────────────────────────────────────────────────────

  async list(ctx: ScimContext, query: ScimBody): Promise<ScimListResult> {
    const startIndex = Math.max(Number(query.startIndex ?? 1) || 1, 1);
    const count = Math.min(Math.max(Number(query.count ?? 100) || 100, 1), 200);

    const where: Record<string, unknown> = {
      tenantId: ctx.endpoint.tenantId,
      endpointId: ctx.endpoint.id,
      resourceType: ScimResourceType.USER,
      deleted: false,
    };
    const filter = this.parseFilter(query.filter);
    if (filter) {
      if (filter.attribute === 'username') {
        where.userName = filter.value.toLowerCase();
      } else if (filter.attribute === 'externalid') {
        where.externalId = filter.value;
      } else if (filter.attribute === 'id') {
        where.id = filter.value;
      } else {
        scimError(400, `Unsupported filter attribute: ${filter.attribute}`, 'invalidFilter');
      }
    }

    const [rows, total] = await this.mappings.findAndCount({
      where,
      order: this.orderFor(query),
      skip: startIndex - 1,
      take: count,
    });

    const resources = await this.hydrate(ctx, rows);
    return {
      schemas: [SCIM_LIST],
      totalResults: total,
      startIndex,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  async get(ctx: ScimContext, id: string): Promise<ScimBody> {
    const mapping = await this.assertMapping(ctx, id);
    const [resource] = await this.hydrate(ctx, [mapping]);
    return resource;
  }

  // ─── Write (tracked) ──────────────────────────────────────────

  async create(ctx: ScimContext, body: ScimBody): Promise<ScimBody> {
    const resource = await this.provisioning.track(
      ctx,
      { operation: ScimOperation.CREATE_USER, payload: body },
      () => this.doCreate(ctx, body),
    );
    this.provisioning.auditOperation(
      ctx,
      'scim_user',
      String(resource.id),
      ScimOperation.CREATE_USER,
      { userName: resource.userName, active: resource.active },
    );
    return resource;
  }

  async replace(ctx: ScimContext, id: string, body: ScimBody): Promise<ScimBody> {
    return this.provisioning.track(
      ctx,
      { operation: ScimOperation.UPDATE_USER, payload: body, resourceId: id },
      () => this.doReplace(ctx, id, body),
    );
  }

  async patch(ctx: ScimContext, id: string, body: ScimBody): Promise<ScimBody> {
    const operation = this.patchOperation(body);
    return this.provisioning.track(
      ctx,
      { operation, payload: body, resourceId: id },
      () => this.doPatch(ctx, id, body),
    );
  }

  async remove(ctx: ScimContext, id: string): Promise<void> {
    await this.provisioning.track(
      ctx,
      { operation: ScimOperation.DELETE_USER, payload: {}, resourceId: id },
      () => this.doDelete(ctx, id),
    );
  }

  // ─── Core operations (used by tracking and by DLQ retry) ──────

  async doCreate(ctx: ScimContext, body: ScimBody): Promise<ScimBody> {
    const tenantId = ctx.endpoint.tenantId;
    const email = this.readEmail(body);
    if (!email) scimError(400, 'userName is required', 'invalidValue');

    const externalId = String(body.externalId ?? email);
    const roleCode = await this.resolveRole(ctx, body);
    const fullName = this.readName(body, email);
    const active = body.active !== false;

    let user = await this.users.findOne({ where: { email } });
    if (!user) {
      user = await this.users.save(
        this.users.create({
          email,
          fullName,
          passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
          isActive: true,
        }),
      );
    }

    const membership = await this.upsertMembership(
      tenantId,
      user.id,
      roleCode,
      active,
    );
    await this.assignRbacRole(tenantId, user.id, roleCode);

    let mapping = await this.mappings.findOne({
      where: {
        tenantId,
        endpointId: ctx.endpoint.id,
        resourceType: ScimResourceType.USER,
        externalId,
      },
    });
    if (!mapping) {
      mapping = this.mappings.create({
        tenantId,
        endpointId: ctx.endpoint.id,
        resourceType: ScimResourceType.USER,
        externalId,
        userName: email,
        displayName: fullName,
        internalUserId: user.id,
        roleCode,
        active,
        deleted: false,
        members: [],
      });
    } else {
      mapping.userName = email;
      mapping.displayName = fullName;
      mapping.internalUserId = user.id;
      mapping.roleCode = roleCode;
      mapping.active = active;
      mapping.deleted = false;
    }
    mapping = await this.mappings.save(mapping);
    return this.toResource(mapping, user, membership);
  }

  async doReplace(
    ctx: ScimContext,
    id: string,
    body: ScimBody,
  ): Promise<ScimBody> {
    const mapping = await this.assertMapping(ctx, id);
    const user = await this.loadUser(mapping);
    const email = this.readEmail(body) ?? user.email;

    if (email !== user.email) {
      const clash = await this.users.findOne({ where: { email } });
      if (clash && clash.id !== user.id) {
        scimError(409, 'userName already exists', 'uniqueness');
      }
      user.email = email;
    }
    user.fullName = this.readName(body, user.fullName);
    await this.users.save(user);

    const roleCode = await this.resolveRole(ctx, body);
    const active = body.active !== false;
    const membership = await this.upsertMembership(
      ctx.endpoint.tenantId,
      user.id,
      roleCode,
      active,
    );
    await this.assignRbacRole(ctx.endpoint.tenantId, user.id, roleCode);

    mapping.userName = user.email;
    mapping.displayName = user.fullName;
    mapping.internalUserId = user.id;
    mapping.roleCode = roleCode;
    mapping.active = active;
    mapping.deleted = false;
    const saved = await this.mappings.save(mapping);
    return this.toResource(saved, user, membership);
  }


  async doPatch(
    ctx: ScimContext,
    id: string,
    body: ScimBody,
  ): Promise<ScimBody> {
    const mapping = await this.assertMapping(ctx, id);
    const user = await this.loadUser(mapping);
    const tenantId = ctx.endpoint.tenantId;

    let active = mapping.active;
    let email = user.email;
    let fullName = user.fullName;
    let roleCode = mapping.roleCode ?? ctx.endpoint.defaultRole;

    for (const op of this.readOperations(body)) {
      const type = String(op.op ?? '').toLowerCase();
      const rawPath = String(op.path ?? '');
      const path = rawPath.toLowerCase();
      const value = op.value;

      if (!path && value && typeof value === 'object' && !Array.isArray(value)) {
        if ('active' in value) active = value.active !== false;
        if ('userName' in value) email = String(value.userName).toLowerCase();
        const nextName = this.readName(value, '');
        if (nextName) fullName = nextName;
        continue;
      }

      switch (path) {
        case 'active':
          active = type === 'remove' ? false : value === true || value === 'true';
          break;
        case 'username':
          email = String(value ?? '').toLowerCase();
          break;
        case 'displayname':
        case 'name.formatted':
          fullName = String(value ?? '');
          break;
        case 'name.givenname':
          fullName = `${String(value ?? '')} ${fullName.split(' ').slice(1).join(' ')}`.trim();
          break;
        case 'name.familyname':
          fullName = `${fullName.split(' ')[0]} ${String(value ?? '')}`.trim();
          break;
        case 'roles':
          roleCode = await this.resolveRole(ctx, {
            roles: Array.isArray(value) ? value : [value],
          });
          break;
        case 'externalid':
          mapping.externalId = String(value);
          break;
        default:
          scimError(400, `Unsupported PATCH path: ${rawPath}`, 'invalidPath');
      }
    }

    if (email !== user.email) {
      const clash = await this.users.findOne({ where: { email } });
      if (clash && clash.id !== user.id) {
        scimError(409, 'userName already exists', 'uniqueness');
      }
      user.email = email;
    }
    if (fullName) user.fullName = fullName;
    await this.users.save(user);

    const membership = await this.upsertMembership(
      tenantId,
      user.id,
      roleCode,
      active,
    );
    await this.assignRbacRole(tenantId, user.id, roleCode);

    mapping.userName = user.email;
    mapping.displayName = user.fullName;
    mapping.internalUserId = user.id;
    mapping.roleCode = roleCode;
    mapping.active = active;
    const saved = await this.mappings.save(mapping);
    return this.toResource(saved, user, membership);
  }

  async doDelete(ctx: ScimContext, id: string): Promise<void> {
    const mapping = await this.assertMapping(ctx, id);
    if (mapping.internalUserId) {
      const membership = await this.memberships.findOne({
        where: { tenantId: ctx.endpoint.tenantId, userId: mapping.internalUserId },
      });
      if (membership) {
        membership.status = MembershipStatus.SUSPENDED;
        await this.memberships.save(membership);
      }
    }
    mapping.active = false;
    mapping.deleted = true;
    await this.mappings.save(mapping);
  }


  // ─── Helpers ──────────────────────────────────────────────────

  private async assertMapping(ctx: ScimContext, id: string): Promise<ScimMapping> {
    const mapping = await this.mappings.findOne({
      where: {
        id,
        tenantId: ctx.endpoint.tenantId,
        endpointId: ctx.endpoint.id,
        resourceType: ScimResourceType.USER,
        deleted: false,
      },
    });
    if (!mapping) scimError(404, 'User not found');
    return mapping;
  }

  private async loadUser(mapping: ScimMapping): Promise<User> {
    const user = mapping.internalUserId
      ? await this.users.findOne({ where: { id: mapping.internalUserId } })
      : null;
    if (!user) scimError(404, 'User not found');
    return user;
  }

  private async hydrate(
    ctx: ScimContext,
    rows: ScimMapping[],
  ): Promise<ScimBody[]> {
    if (rows.length === 0) return [];
    const userIds = rows
      .map((row) => row.internalUserId)
      .filter((value): value is string => Boolean(value));
    const users = userIds.length
      ? await this.users.find({ where: { id: In(userIds) } })
      : [];
    const memberships = userIds.length
      ? await this.memberships.find({
          where: { tenantId: ctx.endpoint.tenantId, userId: In(userIds) },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    const membershipByUser = new Map(
      memberships.map((membership) => [membership.userId, membership]),
    );
    return rows.flatMap((row) => {
      const user = row.internalUserId
        ? userById.get(row.internalUserId)
        : undefined;
      if (!user) return [];
      return [this.toResource(row, user, membershipByUser.get(user.id))];
    });
  }

  private toResource(
    mapping: ScimMapping,
    user: User,
    membership?: TenantUser,
  ): ScimBody {
    const created = new Date(mapping.createdAt).toISOString();
    const modified = new Date(mapping.updatedAt).toISOString();
    return {
      schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER],
      id: mapping.id,
      externalId: mapping.externalId,
      userName: user.email,
      name: { formatted: user.fullName },
      displayName: user.fullName,
      active:
        mapping.active && membership?.status === MembershipStatus.ACTIVE,
      roles: mapping.roleCode
        ? [{ value: mapping.roleCode, primary: true }]
        : [],
      meta: {
        resourceType: 'User',
        created,
        lastModified: modified,
        location: `/scim/v2/Users/${mapping.id}`,
        version: `W/"${modified}"`,
      },
    };
  }

  private orderFor(query: ScimBody): Record<string, 'ASC' | 'DESC'> {
    const direction =
      String(query.sortOrder ?? '').toLowerCase() === 'descending' ? 'DESC' : 'ASC';
    const sortBy = String(query.sortBy ?? '').toLowerCase();
    const map: Record<string, string> = {
      username: 'userName',
      externalid: 'externalId',
      displayname: 'displayName',
      id: 'id',
      createdat: 'createdAt',
      'meta.created': 'createdAt',
    };
    if (!sortBy) return { createdAt: direction };
    const column = map[sortBy];
    if (!column) {
      scimError(400, `Unsupported sortBy attribute: ${query.sortBy}`, 'invalidValue');
    }
    return { [column]: direction };
  }

  private parseFilter(filter?: string): { attribute: string; value: string } | null {
    if (!filter) return null;
    const match = /^\s*([a-zA-Z.]+)\s+eq\s+"([^"]*)"\s*$/.exec(filter);
    if (!match) {
      scimError(
        400,
        'Only filters of the form attribute eq "value" are supported',
        'invalidFilter',
      );
    }
    return { attribute: match[1].toLowerCase(), value: match[2] };
  }


  private patchOperation(body: ScimBody): ScimOperation {
    const suspends = this.readOperations(body).some((op) => {
      const path = String(op.path ?? '').toLowerCase();
      const value = op.value;
      if (path === 'active') return value === false || value === 'false';
      if (!path && value && typeof value === 'object' && 'active' in value) {
        return value.active === false;
      }
      return false;
    });
    return suspends ? ScimOperation.SUSPEND_USER : ScimOperation.UPDATE_USER;
  }

  private readOperations(body: ScimBody): ScimBody[] {
    const ops = body?.Operations ?? body?.operations;
    if (!Array.isArray(ops) || ops.length === 0) {
      scimError(400, 'PatchOp requires a non-empty Operations array', 'invalidValue');
    }
    return ops as ScimBody[];
  }

  private readEmail(body: ScimBody): string | null {
    const raw = body?.userName ?? body?.username ?? body?.emails?.[0]?.value;
    if (!raw) return null;
    const email = String(raw).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      scimError(400, 'userName must be a valid email address', 'invalidValue');
    }
    return email;
  }

  private readName(body: ScimBody, fallback: string): string {
    const formatted = body?.name?.formatted ?? body?.displayName;
    if (formatted) return String(formatted).trim();
    const given = body?.name?.givenName;
    const family = body?.name?.familyName;
    const composed = [given, family].filter(Boolean).join(' ').trim();
    return composed || fallback;
  }

  private async resolveRole(ctx: ScimContext, body: ScimBody): Promise<string> {
    const candidates: string[] = [];
    if (Array.isArray(body?.roles)) {
      for (const role of body.roles) {
        const value = role?.value ?? role?.display;
        if (value) candidates.push(String(value));
      }
    }
    if (body?.roleCode) candidates.push(String(body.roleCode));

    for (const candidate of candidates) {
      const code = candidate.trim().toLowerCase();
      if (!code) continue;
      const role = await this.roles.findOne({
        where: { tenantId: ctx.endpoint.tenantId, code },
      });
      if (role) return role.code;
    }
    return ctx.endpoint.defaultRole || 'member';
  }

  private async assignRbacRole(
    tenantId: string,
    userId: string,
    roleCode: string,
  ): Promise<void> {
    const role = await this.roles.findOne({ where: { tenantId, code: roleCode } });
    if (!role) return;
    const existing = await this.userRoles.findOne({
      where: { userId, roleId: role.id },
    });
    if (!existing) {
      await this.userRoles.save(this.userRoles.create({ userId, roleId: role.id }));
    }
  }

  private async upsertMembership(
    tenantId: string,
    userId: string,
    roleCode: string,
    active: boolean,
  ): Promise<TenantUser> {
    const status = active ? MembershipStatus.ACTIVE : MembershipStatus.SUSPENDED;
    let membership = await this.memberships.findOne({ where: { tenantId, userId } });
    if (!membership) {
      membership = this.memberships.create({
        tenantId,
        userId,
        role: roleCode,
        status,
      });
    } else {
      membership.role = roleCode;
      membership.status = status;
    }
    return this.memberships.save(membership);
  }
}

