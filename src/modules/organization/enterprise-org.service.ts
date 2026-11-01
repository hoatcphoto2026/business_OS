import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnterpriseOrganization } from './entities/enterprise-organization.entity';
import { EnterpriseDepartment } from './entities/enterprise-department.entity';
import { EnterpriseTeam } from './entities/enterprise-team.entity';
import { CostCenter } from './entities/cost-center.entity';
import { OrgMembership } from './entities/org-membership.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { OrgMembershipRole, OrgUnitStatus } from './enums/enterprise-org.enum';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  AssignUserDto,
  CreateCostCenterDto,
  CreateEnterpriseDepartmentDto,
  CreateEnterpriseOrgDto,
  CreateEnterpriseTeamDto,
  CreateOrgMembershipDto,
  MoveOrgUserDto,
  UpdateCostCenterDto,
  UpdateEnterpriseDepartmentDto,
  UpdateEnterpriseOrgDto,
  UpdateEnterpriseTeamDto,
} from './dto/enterprise-org.dto';

@Injectable()
export class EnterpriseOrgService {
  private readonly logger = new Logger(EnterpriseOrgService.name);

  constructor(
    @InjectRepository(EnterpriseOrganization)
    private readonly orgs: Repository<EnterpriseOrganization>,
    @InjectRepository(EnterpriseDepartment)
    private readonly departments: Repository<EnterpriseDepartment>,
    @InjectRepository(EnterpriseTeam)
    private readonly teams: Repository<EnterpriseTeam>,
    @InjectRepository(CostCenter)
    private readonly costCenters: Repository<CostCenter>,
    @InjectRepository(OrgMembership)
    private readonly memberships: Repository<OrgMembership>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  async createOrganization(dto: CreateEnterpriseOrgDto): Promise<EnterpriseOrganization> {
    const tenantId = this.tenantId();
    if (dto.parentId) await this.assertOrg(dto.parentId);
    const saved = await this.orgs.save(
      this.orgs.create({
        tenantId,
        code: dto.code,
        name: dto.name,
        parentId: dto.parentId ?? null,
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe('enterprise_organization', saved.id, AuditAction.CREATE, { code: saved.code });
    this.metricsService.inc('org_units_created_total');
    return saved;
  }

  async listOrganizations(): Promise<EnterpriseOrganization[]> {
    return this.orgs.find({ where: { tenantId: this.tenantId() }, order: { name: 'ASC' } });
  }

  async createDepartment(dto: CreateEnterpriseDepartmentDto): Promise<EnterpriseDepartment> {
    await this.assertOrg(dto.organizationId);
    if (dto.parentId) {
      const parent = await this.assertDepartment(dto.parentId);
      if (parent.organizationId !== dto.organizationId) {
        throw new BadRequestException('Parent department belongs to another organization');
      }
      await this.assertNoCycle(dto.parentId, null, (id) => this.parentOfDepartment(id));
    }
    if (dto.costCenterId) await this.assertCostCenter(dto.costCenterId, dto.organizationId);
    const saved = await this.departments.save(
      this.departments.create({
        tenantId: this.tenantId(),
        organizationId: dto.organizationId,
        parentId: dto.parentId ?? null,
        managerId: dto.managerId ?? null,
        costCenterId: dto.costCenterId ?? null,
        code: dto.code,
        name: dto.name,
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe('enterprise_department', saved.id, AuditAction.CREATE, { code: saved.code });
    this.metricsService.inc('org_departments_created_total');
    return saved;
  }

  async createTeam(dto: CreateEnterpriseTeamDto): Promise<EnterpriseTeam> {
    const department = await this.assertDepartment(dto.departmentId);
    if (dto.parentId) {
      const parent = await this.assertTeam(dto.parentId);
      if (parent.departmentId !== dto.departmentId) {
        throw new BadRequestException('Parent team belongs to another department');
      }
    }
    const saved = await this.teams.save(
      this.teams.create({
        tenantId: this.tenantId(),
        organizationId: department.organizationId,
        departmentId: department.id,
        parentId: dto.parentId ?? null,
        leadId: dto.leadId ?? null,
        code: dto.code,
        name: dto.name,
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe('enterprise_team', saved.id, AuditAction.CREATE, { code: saved.code });
    this.metricsService.inc('org_teams_created_total');
    return saved;
  }

  async createCostCenter(dto: CreateCostCenterDto): Promise<CostCenter> {
    await this.assertOrg(dto.organizationId);
    if (dto.departmentId) {
      const department = await this.assertDepartment(dto.departmentId);
      if (department.organizationId !== dto.organizationId) {
        throw new BadRequestException('Department belongs to another organization');
      }
    }
    const saved = await this.costCenters.save(
      this.costCenters.create({
        tenantId: this.tenantId(),
        organizationId: dto.organizationId,
        departmentId: dto.departmentId ?? null,
        code: dto.code,
        name: dto.name,
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe('cost_center', saved.id, AuditAction.CREATE, { code: saved.code });
    return saved;
  }

  async addMembership(dto: CreateOrgMembershipDto): Promise<OrgMembership> {
    await this.assertOrg(dto.organizationId);
    if (dto.departmentId) {
      const department = await this.assertDepartment(dto.departmentId);
      if (department.organizationId !== dto.organizationId) {
        throw new BadRequestException('Department belongs to another organization');
      }
    }
    if (dto.teamId) await this.assertTeamInOrg(dto.teamId, dto.organizationId);
    const existing = await this.memberships.findOne({
      where: { tenantId: this.tenantId(), organizationId: dto.organizationId, userId: dto.userId },
    });
    if (existing) throw new BadRequestException('User is already in this organization');
    const saved = await this.memberships.save(
      this.memberships.create({
        tenantId: this.tenantId(),
        organizationId: dto.organizationId,
        userId: dto.userId,
        departmentId: dto.departmentId ?? null,
        teamId: dto.teamId ?? null,
        role: dto.role,
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe('org_membership', saved.id, AuditAction.CREATE, { userId: dto.userId, role: dto.role });
    this.metricsService.inc('org_memberships_created_total');
    return saved;
  }

  async moveUser(id: string, dto: MoveOrgUserDto): Promise<OrgMembership> {
    const row = await this.memberships.findOne({ where: { id, tenantId: this.tenantId() } });
    if (!row) throw new NotFoundException('Membership not found');
    const before = { departmentId: row.departmentId, teamId: row.teamId };
    if (dto.departmentId) {
      const department = await this.assertDepartment(dto.departmentId);
      if (department.organizationId !== row.organizationId) {
        throw new BadRequestException('Cannot move a user into another organization');
      }
      row.departmentId = department.id;
    }
    if (dto.teamId) await this.assertTeamInOrg(dto.teamId, row.organizationId);
    if (dto.teamId) row.teamId = dto.teamId;
    row.updatedBy = this.userId();
    const saved = await this.memberships.save(row);
    await this.auditSafe('org_membership', saved.id, AuditAction.UPDATE, { before, after: dto });
    this.metricsService.inc('org_users_moved_total');
    return saved;
  }

  async assignDepartmentManager(departmentId: string, dto: AssignUserDto): Promise<EnterpriseDepartment> {
    const department = await this.assertDepartment(departmentId);
    department.managerId = dto.userId;
    department.updatedBy = this.userId();
    const saved = await this.departments.save(department);
    await this.ensureRole(department.organizationId, dto.userId, OrgMembershipRole.DEPARTMENT_MANAGER, department.id, null);
    await this.auditSafe('enterprise_department', saved.id, AuditAction.UPDATE, { managerId: dto.userId });
    return saved;
  }

  async assignTeamLead(teamId: string, dto: AssignUserDto): Promise<EnterpriseTeam> {
    const team = await this.assertTeam(teamId);
    team.leadId = dto.userId;
    team.updatedBy = this.userId();
    const saved = await this.teams.save(team);
    await this.ensureRole(team.organizationId, dto.userId, OrgMembershipRole.TEAM_LEAD, team.departmentId, team.id);
    await this.auditSafe('enterprise_team', saved.id, AuditAction.UPDATE, { leadId: dto.userId });
    return saved;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Update / deactivate (rename, move, status) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async updateOrganization(
    id: string,
    dto: UpdateEnterpriseOrgDto,
    options: { requireName?: boolean } = {},
  ): Promise<EnterpriseOrganization> {
    if (options.requireName && !dto.name) {
      throw new BadRequestException('name is required');
    }
    const row = await this.assertOrg(id);
    const before = { name: row.name, status: row.status, parentId: row.parentId };

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('Organization cannot be its own parent');
      }
      await this.assertOrg(dto.parentId);
      await this.assertNoCycle(dto.parentId, id, (nodeId) => this.parentOfOrg(nodeId));
      row.parentId = dto.parentId;
    }
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.status !== undefined) row.status = dto.status;
    row.updatedBy = this.userId();

    const saved = await this.orgs.save(row);
    await this.auditSafe('enterprise_organization', saved.id, AuditAction.UPDATE, {
      before,
      after: { name: saved.name, status: saved.status, parentId: saved.parentId },
    });
    this.metricsService.inc('org_units_updated_total');
    return saved;
  }

  async deactivateOrganization(id: string): Promise<EnterpriseOrganization> {
    const row = await this.assertOrg(id);
    const before = row.status;
    row.status = OrgUnitStatus.INACTIVE;
    row.updatedBy = this.userId();
    const saved = await this.orgs.save(row);
    await this.auditSafe('enterprise_organization', saved.id, AuditAction.UPDATE, {
      before,
      after: { status: saved.status },
    });
    this.metricsService.inc('org_units_deactivated_total');
    return saved;
  }

  async updateDepartment(
    id: string,
    dto: UpdateEnterpriseDepartmentDto,
    options: { requireName?: boolean } = {},
  ): Promise<EnterpriseDepartment> {
    if (options.requireName && !dto.name) {
      throw new BadRequestException('name is required');
    }
    const row = await this.assertDepartment(id);
    const before = {
      name: row.name,
      status: row.status,
      parentId: row.parentId,
      costCenterId: row.costCenterId,
    };

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('Department cannot be its own parent');
      }
      const parent = await this.assertDepartment(dto.parentId);
      if (parent.organizationId !== row.organizationId) {
        throw new BadRequestException('Parent department belongs to another organization');
      }
      await this.assertNoCycle(dto.parentId, id, (nodeId) => this.parentOfDepartment(nodeId));
      row.parentId = dto.parentId;
    }
    if (dto.costCenterId !== undefined) {
      await this.assertCostCenter(dto.costCenterId, row.organizationId);
      row.costCenterId = dto.costCenterId;
    }
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.status !== undefined) row.status = dto.status;
    row.updatedBy = this.userId();

    const saved = await this.departments.save(row);
    await this.auditSafe('enterprise_department', saved.id, AuditAction.UPDATE, {
      before,
      after: {
        name: saved.name,
        status: saved.status,
        parentId: saved.parentId,
        costCenterId: saved.costCenterId,
      },
    });
    this.metricsService.inc('org_units_updated_total');
    return saved;
  }

  async deactivateDepartment(id: string): Promise<EnterpriseDepartment> {
    const row = await this.assertDepartment(id);
    const before = row.status;
    row.status = OrgUnitStatus.INACTIVE;
    row.updatedBy = this.userId();
    const saved = await this.departments.save(row);
    await this.auditSafe('enterprise_department', saved.id, AuditAction.UPDATE, {
      before,
      after: { status: saved.status },
    });
    this.metricsService.inc('org_units_deactivated_total');
    return saved;
  }

  async updateTeam(
    id: string,
    dto: UpdateEnterpriseTeamDto,
    options: { requireName?: boolean } = {},
  ): Promise<EnterpriseTeam> {
    if (options.requireName && !dto.name) {
      throw new BadRequestException('name is required');
    }
    const row = await this.assertTeam(id);
    const before = {
      name: row.name,
      status: row.status,
      parentId: row.parentId,
      departmentId: row.departmentId,
    };

    if (dto.departmentId !== undefined) {
      const department = await this.assertDepartment(dto.departmentId);
      row.departmentId = department.id;
      row.organizationId = department.organizationId;
    }
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('Team cannot be its own parent');
      }
      const parent = await this.assertTeam(dto.parentId);
      if (parent.departmentId !== row.departmentId) {
        throw new BadRequestException('Parent team belongs to another department');
      }
      await this.assertNoCycle(dto.parentId, id, (nodeId) => this.parentOfTeam(nodeId));
      row.parentId = dto.parentId;
    }
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.status !== undefined) row.status = dto.status;
    row.updatedBy = this.userId();

    const saved = await this.teams.save(row);
    await this.auditSafe('enterprise_team', saved.id, AuditAction.UPDATE, {
      before,
      after: {
        name: saved.name,
        status: saved.status,
        parentId: saved.parentId,
        departmentId: saved.departmentId,
      },
    });
    this.metricsService.inc('org_units_updated_total');
    return saved;
  }

  async deactivateTeam(id: string): Promise<EnterpriseTeam> {
    const row = await this.assertTeam(id);
    const before = row.status;
    row.status = OrgUnitStatus.INACTIVE;
    row.updatedBy = this.userId();
    const saved = await this.teams.save(row);
    await this.auditSafe('enterprise_team', saved.id, AuditAction.UPDATE, {
      before,
      after: { status: saved.status },
    });
    this.metricsService.inc('org_units_deactivated_total');
    return saved;
  }

  async updateCostCenter(
    id: string,
    dto: UpdateCostCenterDto,
    options: { requireName?: boolean } = {},
  ): Promise<CostCenter> {
    if (options.requireName && !dto.name) {
      throw new BadRequestException('name is required');
    }
    const row = await this.costCenters.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) throw new NotFoundException('Cost center not found');
    const before = { name: row.name, status: row.status, departmentId: row.departmentId };

    if (dto.departmentId !== undefined) {
      const department = await this.assertDepartment(dto.departmentId);
      if (department.organizationId !== row.organizationId) {
        throw new BadRequestException('Department belongs to another organization');
      }
      row.departmentId = department.id;
    }
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.status !== undefined) row.status = dto.status;
    row.updatedBy = this.userId();

    const saved = await this.costCenters.save(row);
    await this.auditSafe('cost_center', saved.id, AuditAction.UPDATE, {
      before,
      after: { name: saved.name, status: saved.status, departmentId: saved.departmentId },
    });
    this.metricsService.inc('org_units_updated_total');
    return saved;
  }

  async deactivateCostCenter(id: string): Promise<CostCenter> {
    const row = await this.costCenters.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) throw new NotFoundException('Cost center not found');
    const before = row.status;
    row.status = OrgUnitStatus.INACTIVE;
    row.updatedBy = this.userId();
    const saved = await this.costCenters.save(row);
    await this.auditSafe('cost_center', saved.id, AuditAction.UPDATE, {
      before,
      after: { status: saved.status },
    });
    this.metricsService.inc('org_units_deactivated_total');
    return saved;
  }

  async tree(organizationId: string) {
    const root = await this.assertOrg(organizationId);
    const tenantId = this.tenantId();
    const [organizations, departments, teams, members] = await Promise.all([
      this.orgs.find({ where: { tenantId } }),
      this.departments.find({ where: { tenantId } }),
      this.teams.find({ where: { tenantId } }),
      this.memberships.find({ where: { tenantId } }),
    ]);
    return this.buildOrgNode(root, organizations, departments, teams, members);
  }

  async statistics(organizationId: string) {
    await this.assertOrg(organizationId);
    const tenantId = this.tenantId();
    const orgIds = await this.descendantOrgIds(organizationId);
    const departments = await this.departments.find({ where: { tenantId } });
    const teams = await this.teams.find({ where: { tenantId } });
    const members = await this.memberships.find({ where: { tenantId } });
    const centers = await this.costCenters.find({ where: { tenantId } });
    const inScope = (organizationIdValue: string) => orgIds.has(organizationIdValue);
    return {
      organizationId,
      organizations: orgIds.size,
      departments: departments.filter((row) => inScope(row.organizationId)).length,
      teams: teams.filter((row) => inScope(row.organizationId)).length,
      members: members.filter((row) => inScope(row.organizationId)).length,
      costCenters: centers.filter((row) => inScope(row.organizationId)).length,
      departmentManagers: departments.filter((row) => inScope(row.organizationId) && row.managerId).length,
      teamLeads: teams.filter((row) => inScope(row.organizationId) && row.leadId).length,
    };
  }

  async costCenterReport(organizationId: string) {
    await this.assertOrg(organizationId);
    const tenantId = this.tenantId();
    const centers = await this.costCenters.find({ where: { tenantId, organizationId } });
    const members = await this.memberships.find({ where: { tenantId, organizationId } });
    const departments = await this.departments.find({ where: { tenantId, organizationId } });
    return {
      organizationId,
      costCenters: centers.map((center) => {
        const linkedDepartments = departments.filter((row) => row.costCenterId === center.id || row.id === center.departmentId);
        const departmentIds = new Set(linkedDepartments.map((row) => row.id));
        if (center.departmentId) departmentIds.add(center.departmentId);
        return {
          id: center.id,
          code: center.code,
          name: center.name,
          departmentId: center.departmentId,
          departmentCount: departmentIds.size,
          memberCount: members.filter((row) => row.departmentId && departmentIds.has(row.departmentId)).length,
        };
      }),
    };
  }

  async metrics(): Promise<string> {
    return this.metricsService.text();
  }

  private buildOrgNode(
    org: EnterpriseOrganization,
    organizations: EnterpriseOrganization[],
    departments: EnterpriseDepartment[],
    teams: EnterpriseTeam[],
    members: OrgMembership[],
  ): Record<string, unknown> {
    const orgDepartments = departments.filter((row) => row.organizationId === org.id);
    return {
      id: org.id,
      code: org.code,
      name: org.name,
      status: org.status,
      departments: this.buildDepartments(null, orgDepartments, teams, members),
      children: organizations
        .filter((row) => row.parentId === org.id)
        .map((child) => this.buildOrgNode(child, organizations, departments, teams, members)),
    };
  }

  private buildDepartments(
    parentId: string | null,
    departments: EnterpriseDepartment[],
    teams: EnterpriseTeam[],
    members: OrgMembership[],
  ): Record<string, unknown>[] {
    return departments
      .filter((row) => row.parentId === parentId)
      .map((department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
        status: department.status,
        managerId: department.managerId,
        children: this.buildDepartments(department.id, departments, teams, members),
        teams: this.buildTeams(department.id, null, teams, members),
      }));
  }

  private buildTeams(
    departmentId: string,
    parentId: string | null,
    teams: EnterpriseTeam[],
    members: OrgMembership[],
  ): Record<string, unknown>[] {
    return teams
      .filter((row) => row.departmentId === departmentId && row.parentId === parentId)
      .map((team) => ({
        id: team.id,
        code: team.code,
        name: team.name,
        status: team.status,
        leadId: team.leadId,
        users: members
          .filter((row) => row.teamId === team.id)
          .map((row) => ({ userId: row.userId, role: row.role })),
        children: this.buildTeams(departmentId, team.id, teams, members),
      }));
  }

  private async descendantOrgIds(rootId: string): Promise<Set<string>> {
    const all = await this.orgs.find({ where: { tenantId: this.tenantId() } });
    const ids = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const org of all) {
        if (org.parentId && ids.has(org.parentId) && !ids.has(org.id)) {
          ids.add(org.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  private async ensureRole(
    organizationId: string,
    userId: string,
    role: OrgMembershipRole,
    departmentId: string | null,
    teamId: string | null,
  ) {
    const tenantId = this.tenantId();
    const existing = await this.memberships.findOne({ where: { tenantId, organizationId, userId } });
    if (!existing) {
      await this.memberships.save(
        this.memberships.create({
          tenantId,
          organizationId,
          userId,
          departmentId,
          teamId,
          role,
          createdBy: this.userId(),
        }),
      );
      return;
    }
    existing.role = role;
    if (departmentId) existing.departmentId = departmentId;
    if (teamId) existing.teamId = teamId;
    existing.updatedBy = this.userId();
    await this.memberships.save(existing);
  }

  private async assertOrg(id: string): Promise<EnterpriseOrganization> {
    const row = await this.orgs.findOne({ where: { id, tenantId: this.tenantId() } });
    if (!row) throw new NotFoundException('Organization not found');
    return row;
  }

  private async assertDepartment(id: string): Promise<EnterpriseDepartment> {
    const row = await this.departments.findOne({ where: { id, tenantId: this.tenantId() } });
    if (!row) throw new NotFoundException('Department not found');
    return row;
  }

  private async assertTeam(id: string): Promise<EnterpriseTeam> {
    const row = await this.teams.findOne({ where: { id, tenantId: this.tenantId() } });
    if (!row) throw new NotFoundException('Team not found');
    return row;
  }

  private async assertTeamInOrg(teamId: string, organizationId: string) {
    const team = await this.assertTeam(teamId);
    if (team.organizationId !== organizationId) {
      throw new BadRequestException('Team belongs to another organization');
    }
  }

  private async assertCostCenter(id: string, organizationId: string) {
    const row = await this.costCenters.findOne({ where: { id, tenantId: this.tenantId() } });
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Cost center not found');
    }
  }

  private async parentOfOrg(id: string): Promise<string | null> {
    const row = await this.orgs.findOne({ where: { id, tenantId: this.tenantId() } });
    return row?.parentId ?? null;
  }

  private async parentOfTeam(id: string): Promise<string | null> {
    const row = await this.teams.findOne({ where: { id, tenantId: this.tenantId() } });
    return row?.parentId ?? null;
  }

  private async parentOfDepartment(id: string): Promise<string | null> {
    const row = await this.departments.findOne({ where: { id, tenantId: this.tenantId() } });
    return row?.parentId ?? null;
  }

  private async assertNoCycle(
    parentId: string,
    selfId: string | null,
    parentOf: (id: string) => Promise<string | null>,
  ) {
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current) {
      if (current === selfId || seen.has(current)) {
        throw new BadRequestException('Organization hierarchy cannot contain a cycle');
      }
      seen.add(current);
      current = await parentOf(current);
    }
  }

  private tenantId() {
    return this.tenantContext.getCurrentTenantId();
  }

  private userId() {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  private async auditSafe(
    entity: string,
    id: string,
    action: AuditAction,
    data: Record<string, unknown>,
  ) {
    try {
      await this.audit.logAction(entity, id, action, { newData: data });
    } catch (err) {
      this.logger.warn(`Org audit skipped: ${(err as Error).message}`);
    }
  }
}
