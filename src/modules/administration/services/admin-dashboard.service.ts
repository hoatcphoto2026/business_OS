import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TenantUser } from '../../tenant/entities/tenant-user.entity';
import { Team } from '../../team/entities/team.entity';
import { Role } from '../../rbac/entities/role.entity';
import { ApiKey } from '../../integration/entities/api-key.entity';
import { TenantFeature } from '../../feature/entities/tenant-feature.entity';
import { LoginHistory } from '../entities/login-history.entity';
import { WorkflowInstance } from '../../workflow/entities/workflow-instance.entity';
import { WorkflowStatus } from '../../workflow/enums/workflow-status.enum';
import { EventLog } from '../../event/entities/event-log.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @InjectRepository(TenantUser) private readonly memberships: Repository<TenantUser>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(ApiKey) private readonly apiKeys: Repository<ApiKey>,
    @InjectRepository(TenantFeature) private readonly tenantFeatures: Repository<TenantFeature>,
    @InjectRepository(LoginHistory) private readonly logins: Repository<LoginHistory>,
    @InjectRepository(WorkflowInstance) private readonly workflows: Repository<WorkflowInstance>,
    @InjectRepository(EventLog) private readonly events: Repository<EventLog>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getDashboard() {
    const tenantId = this.tenantContext.getCurrentTenantId();

    const safe = async <T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.error(`Dashboard query failed [${label}]: ${(err as Error).message}`);
        return fallback;
      }
    };

    const [users, teams, roles, apiKeys, enabledFeatures, recentLogins, pendingWorkflows, recentEvents] =
      await Promise.all([
        safe(() => this.memberships.count({ where: { tenantId } }), 0, 'users'),
        safe(() => this.teams.count({ where: { tenantId } }), 0, 'teams'),
        safe(() => this.roles.count({ where: { tenantId } }), 0, 'roles'),
        safe(() => this.apiKeys.count({ where: { tenantId, status: 'active' } }), 0, 'apiKeys'),
        safe(() => this.tenantFeatures.count({ where: { tenantId, enabled: true } }), 0, 'features'),
        safe(() => this.logins.find({ where: { tenantId }, order: { loginAt: 'DESC' }, take: 10 }), [], 'loginHistory'),
        safe(() => this.workflows.count({ where: { tenantId, currentStatus: WorkflowStatus.PENDING } }), 0, 'workflows'),
        safe(() => this.events.find({ where: { tenantId }, order: { createdAt: 'DESC' }, take: 10 }), [], 'events'),
      ]);

    return {
      users,
      teams,
      roles,
      apiKeys,
      enabledFeatures,
      recentLogins,
      pendingWorkflows,
      recentEvents,
    };
  }
}
