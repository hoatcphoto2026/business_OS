import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from '../../team/entities/team.entity';
import { TeamMember } from '../../team/entities/team-member.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class TeamManagementService {
  constructor(
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(TeamMember) private readonly members: Repository<TeamMember>,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    return this.teams.find({
      where: { tenantId },
      relations: ['members', 'members.user'],
      order: { createdAt: 'DESC' },
    });
  }

  async create(data: { code: string; name: string; managerId?: string; companyId?: string; branchId?: string }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const team = await this.teams.save(
      this.teams.create({
        tenantId,
        code: data.code,
        name: data.name,
        managerId: data.managerId ?? null,
        companyId: data.companyId ?? null,
        branchId: data.branchId ?? null,
        status: 'active',
      }),
    );

    await this.auditService.logCreate('team', team);
    await this.eventBus.publish(EventType.TeamCreated, 'team', team.id, { code: team.code });

    return team;
  }

  async update(id: string, data: { name?: string; managerId?: string; status?: string }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const team = await this.teams.findOne({ where: { id, tenantId } });
    if (!team) throw new NotFoundException('Team not found');

    const before = { name: team.name, managerId: team.managerId, status: team.status };
    if (data.name !== undefined) team.name = data.name;
    if (data.managerId !== undefined) team.managerId = data.managerId;
    if (data.status !== undefined) team.status = data.status;
    const saved = await this.teams.save(team);

    await this.auditService.logUpdate('team', before, saved);
    return saved;
  }

  async remove(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const team = await this.teams.findOne({ where: { id, tenantId } });
    if (!team) throw new NotFoundException('Team not found');

    await this.teams.remove(team);
    await this.auditService.logAction('team', id, 'DELETE' as any, {});
    return { deleted: true };
  }

  async addMember(teamId: string, userId: string, isManager = false) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const team = await this.teams.findOne({ where: { id: teamId, tenantId } });
    if (!team) throw new NotFoundException('Team not found');

    const member = await this.members.save(
      this.members.create({ teamId, userId, isManager }),
    );
    return member;
  }
}
