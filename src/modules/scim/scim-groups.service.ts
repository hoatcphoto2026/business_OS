import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ScimMapping, ScimMemberRef } from './entities/scim-mapping.entity';
import {
  ScimOperation,
  ScimResourceType,
  ScimSyncTarget,
  SCIM_GROUP_EXT,
  SCIM_GROUP_SCHEMA,
  SCIM_LIST,
} from './enums/scim.enum';
import { EnterpriseOrganization } from '../organization/entities/enterprise-organization.entity';
import { EnterpriseDepartment } from '../organization/entities/enterprise-department.entity';
import { OrgMembership } from '../organization/entities/org-membership.entity';
import { OrgMembershipRole, OrgUnitStatus } from '../organization/enums/enterprise-org.enum';
import { User } from '../users/entities/user.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { scimError } from './scim.errors';
import { ScimContext, ScimListResult } from './scim.types';
import { ScimProvisioningService } from './scim-provisioning.service';

type ScimBody = Record<string, any>;

@Injectable()
export class ScimGroupsService {
  private readonly logger = new Logger(ScimGroupsService.name);

  constructor(
    @InjectRepository(ScimMapping)
    private readonly mappings: Repository<ScimMapping>,
    @InjectRepository(EnterpriseOrganization)
    private readonly organizations: Repository<EnterpriseOrganization>,
    @InjectRepository(EnterpriseDepartment)
    private readonly departments: Repository<EnterpriseDepartment>,
    @InjectRepository(OrgMembership)
    private readonly orgMemberships: Repository<OrgMembership>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(TenantUser)
    private readonly memberships: Repository<TenantUser>,
    private readonly provisioning: ScimProvisioningService,
  ) {}

  async list(ctx: ScimContext, query: ScimBody): Promise<ScimListResult> {
    const startIndex = Math.max(Number(query.startIndex ?? 1) || 1, 1);
    const count = Math.min(Math.max(Number(query.count ?? 100) || 100, 1), 200);
    const where: Record<string, unknown> = {
      tenantId: ctx.endpoint.tenantId,
      endpointId: ctx.endpoint.id,
      resourceType: ScimResourceType.GROUP,
      deleted: false,
    };
    if (query.filter) {
      const match = /^\s*([a-zA-Z.]+)\s+eq\s+"([^"]*)"\s*$/.exec(String(query.filter));
      if (!match) {
        scimError(400, 'Only filters of the form attribute eq "value" are supported', 'invalidFilter');
      }
      const attribute = match[1].toLowerCase();
      if (attribute === 'displayname') where.displayName = match[2];
      else if (attribute === 'externalid') where.externalId = match[2];
      else if (attribute === 'id') where.id = match[2];
      else scimError(400, `Unsupported filter attribute: ${attribute}`, 'invalidFilter');
    }

    const [rows, total] = await this.mappings.findAndCount({
      where,
      order: this.orderFor(query),
      skip: startIndex - 1,
      take: count,
    });

    return {
      schemas: [SCIM_LIST],
      totalResults: total,
      startIndex,
      itemsPerPage: rows.length,
      Resources: rows.map((row) => this.toResource(row)),
    };
  }

  async get(ctx: ScimContext, id: string): Promise<ScimBody> {
    const mapping = await this.assertMapping(ctx, id);
    return this.toResource(mapping);
  }

  async create(ctx: ScimContext, body: ScimBody): Promise<ScimBody> {
    const operation = this.operationFor(body);
    const resource = await this.provisioning.track(
      ctx,
      { operation, payload: body },
      () => this.doUpsert(ctx, null, body),
    );
    this.provisioning.auditOperation(ctx, 'scim_group', String(resource.id), operation, {
      displayName: resource.displayName,
      syncTarget: resource[SCIM_GROUP_EXT]?.syncTarget,
    });
    return resource;
  }

  async replace(ctx: ScimContext, id: string, body: ScimBody): Promise<ScimBody> {
    return this.provisioning.track(
      ctx,
      { operation: this.operationFor(body), payload: body, resourceId: id },
      () => this.doUpsert(ctx, id, body),
    );
  }

  async patch(ctx: ScimContext, id: string, body: ScimBody): Promise<ScimBody> {
    return this.provisioning.track(
      ctx,
      { operation: this.operationFor(body), payload: body, resourceId: id },
      () => this.doPatch(ctx, id, body),
    );
  }

  async remove(ctx: ScimContext, id: string): Promise<void> {
    await this.provisioning.track(
      ctx,
      { operation: ScimOperation.GROUP_SYNC, payload: {}, resourceId: id },
      () => this.doDelete(ctx, id),
    );
  }

  // ─── Core operations ─────────────────────────────────────────

  async doUpsert(
    ctx: ScimContext,
    id: string | null,
    body: ScimBody,
  ): Promise<ScimBody> {
    const tenantId = ctx.endpoint.tenantId;
    const displayName = String(body?.displayName ?? '').trim();
    if (!displayName) scimError(400, 'displayName is required', 'invalidValue');

    const ext = body?.[SCIM_GROUP_EXT] ?? {};
    const syncTarget = this.syncTargetFor(ext, body);
    const externalId = String(body?.externalId ?? this.slug(displayName));
    const members = this.readMembers(body);
    const userIds = await this.resolveMembers(ctx, members);

    let mapping = id
      ? await this.assertMapping(ctx, id)
      : await this.mappings.findOne({
          where: {
            tenantId,
            endpointId: ctx.endpoint.id,
            resourceType: ScimResourceType.GROUP,
            externalId,
          },
        });

    let organizationId: string | null = null;
    let organizationName: string | null = null;
    let departmentId: string | null = null;
    let departmentName: string | null = null;

    if (syncTarget === ScimSyncTarget.ORGANIZATION) {
      const code = String(ext.organizationCode ?? externalId);
      const organization = await this.ensureOrganization(tenantId, code, displayName);
      organizationId = organization.id;
      organizationName = organization.name;
    } else {
      const orgCode = String(
        ext.organizationCode ?? ctx.endpoint.organizationCode ?? '',
      );
      const organization = await this.organizations.findOne({
        where: { tenantId, code: orgCode },
      });
      if (!organization) {
        scimError(400, `Organization "${orgCode}" not found`, 'invalidValue');
      }
      organizationId = organization.id;
      organizationName = organization.name;

      if (syncTarget === ScimSyncTarget.DEPARTMENT) {
        const department = await this.ensureDepartment(
          tenantId,
          organization.id,
          externalId,
          displayName,
        );
        departmentId = department.id;
        departmentName = department.name;
      }
    }

    await this.assignMemberships(ctx, organizationId, departmentId, userIds);

    if (!mapping) {
      mapping = this.mappings.create({
        tenantId,
        endpointId: ctx.endpoint.id,
        resourceType: ScimResourceType.GROUP,
        syncTarget: syncTarget ?? null,
        externalId,
        displayName,
        internalOrgId: organizationId,
        internalDepartmentId: departmentId,
        organizationName,
        departmentName,
        active: true,
        deleted: false,
        members,
      });
    } else {
      mapping.syncTarget = syncTarget ?? null;
      mapping.externalId = externalId;
      mapping.displayName = displayName;
      mapping.internalOrgId = organizationId;
      mapping.internalDepartmentId = departmentId;
      mapping.organizationName = organizationName;
      mapping.departmentName = departmentName;
      mapping.active = true;
      mapping.deleted = false;
      mapping.members = members;
    }
    mapping = await this.mappings.save(mapping);
    return this.toResource(mapping);
  }


  async doPatch(
    ctx: ScimContext,
    id: string,
    body: ScimBody,
  ): Promise<ScimBody> {
    const mapping = await this.assertMapping(ctx, id);
    const ops = body?.Operations ?? body?.operations;
    if (!Array.isArray(ops) || ops.length === 0) {
      scimError(400, 'PatchOp requires a non-empty Operations array', 'invalidValue');
    }

    let displayName = mapping.displayName ?? '';
    let members: ScimMemberRef[] = [...(mapping.members ?? [])];
    const removed: ScimMemberRef[] = [];

    for (const op of ops) {
      const type = String(op.op ?? '').toLowerCase();
      const rawPath = String(op.path ?? '');
      const path = rawPath.toLowerCase();

      if (path === 'displayname') {
        displayName = String(op.value ?? displayName);
        continue;
      }
      if (path === '' || path === 'members') {
        const values = this.toMemberArray(op.value);
        if (type === 'add') {
          members = this.mergeMembers(members, values);
        } else if (type === 'remove') {
          const targets = values.length > 0 ? values : members;
          removed.push(...targets);
          const targetIds = new Set(targets.map((item) => item.value));
          members = members.filter((item) => !targetIds.has(item.value));
        } else if (type === 'replace') {
          removed.push(...members);
          members = values;
        } else {
          scimError(400, `Unsupported PATCH op: ${op.op}`, 'invalidValue');
        }
        continue;
      }
      scimError(400, `Unsupported PATCH path: ${rawPath}`, 'invalidPath');
    }

    if (displayName !== mapping.displayName) {
      mapping.displayName = displayName;
      if (mapping.internalDepartmentId) {
        const department = await this.departments.findOne({
          where: { id: mapping.internalDepartmentId, tenantId: ctx.endpoint.tenantId },
        });
        if (department) {
          department.name = displayName;
          await this.departments.save(department);
        }
      }
      if (
        mapping.syncTarget === ScimSyncTarget.ORGANIZATION &&
        mapping.internalOrgId
      ) {
        const organization = await this.organizations.findOne({
          where: { id: mapping.internalOrgId, tenantId: ctx.endpoint.tenantId },
        });
        if (organization) {
          organization.name = displayName;
          await this.organizations.save(organization);
        }
      }
    }

    const userIds = await this.resolveMembers(ctx, members);
    await this.assignMemberships(
      ctx,
      mapping.internalOrgId,
      mapping.internalDepartmentId,
      userIds,
    );
    if (removed.length > 0) {
      const removedIds = await this.resolveMembers(ctx, removed, true);
      await this.removeMemberships(ctx, mapping.internalOrgId, removedIds);
    }

    mapping.members = members;
    const saved = await this.mappings.save(mapping);
    return this.toResource(saved);
  }

  async doDelete(ctx: ScimContext, id: string): Promise<void> {
    const mapping = await this.assertMapping(ctx, id);
    const tenantId = ctx.endpoint.tenantId;

    if (mapping.internalDepartmentId) {
      const department = await this.departments.findOne({
        where: { id: mapping.internalDepartmentId, tenantId },
      });
      if (department) {
        department.status = OrgUnitStatus.INACTIVE;
        await this.departments.save(department);
      }
    }
    if (
      mapping.syncTarget === ScimSyncTarget.ORGANIZATION &&
      mapping.internalOrgId
    ) {
      const organization = await this.organizations.findOne({
        where: { id: mapping.internalOrgId, tenantId },
      });
      if (organization) {
        organization.status = OrgUnitStatus.INACTIVE;
        await this.organizations.save(organization);
      }
    }
    mapping.deleted = true;
    mapping.active = false;
    await this.mappings.save(mapping);
  }


  // ─── Helpers ──────────────────────────────────────────────────

  private orderFor(query: ScimBody): Record<string, 'ASC' | 'DESC'> {
    const direction =
      String(query.sortOrder ?? '').toLowerCase() === 'descending' ? 'DESC' : 'ASC';
    const sortBy = String(query.sortBy ?? '').toLowerCase();
    const map: Record<string, string> = {
      displayname: 'displayName',
      externalid: 'externalId',
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

  private async assertMapping(ctx: ScimContext, id: string): Promise<ScimMapping> {
    const mapping = await this.mappings.findOne({
      where: {
        id,
        tenantId: ctx.endpoint.tenantId,
        endpointId: ctx.endpoint.id,
        resourceType: ScimResourceType.GROUP,
        deleted: false,
      },
    });
    if (!mapping) scimError(404, 'Group not found');
    return mapping;
  }

  private operationFor(body: ScimBody): ScimOperation {
    const ext = body?.[SCIM_GROUP_EXT] ?? {};
    const target = this.syncTargetFor(ext, body);
    if (target === ScimSyncTarget.ORGANIZATION) {
      return ScimOperation.ORGANIZATION_SYNC;
    }
    if (target === ScimSyncTarget.DEPARTMENT) {
      return ScimOperation.DEPARTMENT_SYNC;
    }
    return ScimOperation.GROUP_SYNC;
  }

  private syncTargetFor(ext: ScimBody, body: ScimBody): ScimSyncTarget | null {
    const raw = String(ext?.syncTarget ?? body?.syncTarget ?? '').toUpperCase();
    if (raw === ScimSyncTarget.ORGANIZATION) return ScimSyncTarget.ORGANIZATION;
    if (raw === ScimSyncTarget.DEPARTMENT) return ScimSyncTarget.DEPARTMENT;
    return null;
  }

  private slug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 50) || `group-${Date.now()}`;
  }

  private readMembers(body: ScimBody): ScimMemberRef[] {
    return this.toMemberArray(body?.members);
  }

  private toMemberArray(value: unknown): ScimMemberRef[] {
    const items = Array.isArray(value) ? value : value ? [value] : [];
    return items
      .map((item) => {
        if (typeof item === 'string') return { value: item } as ScimMemberRef;
        if (item && typeof item === 'object' && 'value' in item) {
          const raw = item as { value?: unknown; display?: unknown };
          return {
            value: String(raw.value ?? ''),
            ...(raw.display ? { display: String(raw.display) } : {}),
          } as ScimMemberRef;
        }
        return null;
      })
      .filter((item): item is ScimMemberRef => Boolean(item && item.value));
  }

  private mergeMembers(
    current: ScimMemberRef[],
    added: ScimMemberRef[],
  ): ScimMemberRef[] {
    const byValue = new Map(current.map((item) => [item.value, item]));
    for (const item of added) byValue.set(item.value, item);
    return Array.from(byValue.values());
  }

  private async resolveMembers(
    ctx: ScimContext,
    members: ScimMemberRef[],
    lenient = false,
  ): Promise<string[]> {
    const tenantId = ctx.endpoint.tenantId;
    const userIds = new Set<string>();

    for (const member of members) {
      const value = String(member?.value ?? '').trim();
      if (!value) continue;

      const mapping = await this.mappings.findOne({
        where: {
          id: value,
          tenantId,
          endpointId: ctx.endpoint.id,
          resourceType: ScimResourceType.USER,
          deleted: false,
        },
      });
      let userId = mapping?.internalUserId ?? null;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      if (!userId && isUuid) {
        const user = await this.users.findOne({ where: { id: value } });
        if (user) userId = user.id;
      }
      if (!userId) {
        if (lenient) continue;
        scimError(400, `Unknown member: ${value}`, 'invalidValue');
      }

      const membership = await this.memberships.findOne({
        where: { tenantId, userId },
      });
      if (!membership) {
        if (lenient) continue;
        scimError(400, `Member ${value} is not provisioned in this tenant`, 'invalidValue');
      }
      userIds.add(userId);
    }
    return Array.from(userIds);
  }


  private async ensureOrganization(
    tenantId: string,
    code: string,
    name: string,
  ): Promise<EnterpriseOrganization> {
    let organization = await this.organizations.findOne({
      where: { tenantId, code },
    });
    if (!organization) {
      organization = await this.organizations.save(
        this.organizations.create({
          tenantId,
          code: code.slice(0, 50),
          name: name.slice(0, 255),
          status: OrgUnitStatus.ACTIVE,
        }),
      );
      return organization;
    }
    if (organization.name !== name) {
      organization.name = name.slice(0, 255);
      organization.status = OrgUnitStatus.ACTIVE;
      organization = await this.organizations.save(organization);
    }
    return organization;
  }

  private async ensureDepartment(
    tenantId: string,
    organizationId: string,
    code: string,
    name: string,
  ): Promise<EnterpriseDepartment> {
    let department = await this.departments.findOne({
      where: { tenantId, organizationId, code },
    });
    if (!department) {
      department = await this.departments.save(
        this.departments.create({
          tenantId,
          organizationId,
          code: code.slice(0, 50),
          name: name.slice(0, 255),
          status: OrgUnitStatus.ACTIVE,
        }),
      );
      return department;
    }
    if (department.name !== name || department.status !== OrgUnitStatus.ACTIVE) {
      department.name = name.slice(0, 255);
      department.status = OrgUnitStatus.ACTIVE;
      department = await this.departments.save(department);
    }
    return department;
  }

  private async assignMemberships(
    ctx: ScimContext,
    organizationId: string | null,
    departmentId: string | null,
    userIds: string[],
  ): Promise<void> {
    if (!organizationId || userIds.length === 0) return;
    const tenantId = ctx.endpoint.tenantId;

    for (const userId of userIds) {
      const existing = await this.orgMemberships.findOne({
        where: { tenantId, organizationId, userId },
      });
      if (!existing) {
        await this.orgMemberships.save(
          this.orgMemberships.create({
            tenantId,
            organizationId,
            userId,
            departmentId,
            role: OrgMembershipRole.MEMBER,
          }),
        );
        continue;
      }
      if (departmentId && existing.departmentId !== departmentId) {
        existing.departmentId = departmentId;
      }
      if (existing.role !== OrgMembershipRole.MEMBER && existing.role !== OrgMembershipRole.DEPARTMENT_MANAGER && existing.role !== OrgMembershipRole.TEAM_LEAD && existing.role !== OrgMembershipRole.ORGANIZATION_ADMIN) {
        existing.role = OrgMembershipRole.MEMBER;
      }
      await this.orgMemberships.save(existing);
    }
  }

  private async removeMemberships(
    ctx: ScimContext,
    organizationId: string | null,
    userIds: string[],
  ): Promise<void> {
    if (!organizationId || userIds.length === 0) return;
    await this.orgMemberships.delete({
      tenantId: ctx.endpoint.tenantId,
      organizationId,
      userId: In(userIds),
    });
  }

  private toResource(mapping: ScimMapping): ScimBody {
    const created = new Date(mapping.createdAt).toISOString();
    const modified = new Date(mapping.updatedAt).toISOString();
    return {
      schemas: [SCIM_GROUP_SCHEMA, SCIM_GROUP_EXT],
      id: mapping.id,
      externalId: mapping.externalId,
      displayName: mapping.displayName,
      members: (mapping.members ?? []).map((member) => ({
        value: member.value,
        ...(member.display ? { display: member.display } : {}),
      })),
      [SCIM_GROUP_EXT]: {
        syncTarget: mapping.syncTarget,
        organizationId: mapping.internalOrgId,
        organizationName: mapping.organizationName,
        departmentId: mapping.internalDepartmentId,
        departmentName: mapping.departmentName,
      },
      meta: {
        resourceType: 'Group',
        created,
        lastModified: modified,
        location: `/scim/v2/Groups/${mapping.id}`,
        version: `W/"${modified}"`,
      },
    };
  }
}

