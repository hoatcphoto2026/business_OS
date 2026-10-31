import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministrationController } from './administration.controller';
import { UserManagementService } from './services/user-management.service';
import { TeamManagementService } from './services/team-management.service';
import { RoleManagementService } from './services/role-management.service';
import { PermissionManagementService } from './services/permission-management.service';
import { FeatureManagementService } from './services/feature-management.service';
import { ApiKeyManagementService } from './services/api-key-management.service';
import { WebhookManagementService } from './services/webhook-management.service';
import { SettingsManagementService } from './services/settings-management.service';
import { LoginHistoryService } from './services/login-history.service';
import { CopilotSettingsService } from './services/copilot-settings.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminOnlyGuard } from './guards/admin-only.guard';
import { AdminRateLimitGuard } from './guards/admin-rate-limit.guard';
import { AdminMetricsService } from './services/admin-metrics.service';
import { StepUpSession } from './entities/step-up-session.entity';
import { StepUpService } from './services/step-up.service';
import { AdminObservabilityInterceptor } from './interceptors/admin-observability.interceptor';
import { StepUpGuard } from './guards/step-up.guard';
import { LoginHistoryRetentionJob } from './jobs/login-history-retention.job';
import { AdminTracingInterceptor } from './interceptors/admin-tracing.interceptor';
import { AuditArchiveJob } from './jobs/audit-archive.job';
import { BreakGlassService } from './services/break-glass.service';

import { User } from '../users/entities/user.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { Team } from '../team/entities/team.entity';
import { TeamMember } from '../team/entities/team-member.entity';
import { Role } from '../rbac/entities/role.entity';
import { RolePermission } from '../rbac/entities/role-permission.entity';
import { Permission } from '../rbac/entities/permission.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { TenantSetting } from './entities/tenant-setting.entity';
import { LoginHistory } from './entities/login-history.entity';
import { CopilotSetting } from './entities/copilot-setting.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { TenantFeature } from '../feature/entities/tenant-feature.entity';
import { WorkflowInstance } from '../workflow/entities/workflow-instance.entity';
import { EventLog } from '../event/entities/event-log.entity';

import { FeatureModule } from '../feature/feature.module';
import { IntegrationModule } from '../integration/integration.module';
import { AuditModule } from '../audit/audit.module';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TenantUser,
      Team,
      TeamMember,
      Role,
      RolePermission,
      Permission,
      UserRole,
      TenantSetting,
      LoginHistory,
      CopilotSetting,
      StepUpSession,
      ApiKey,
      TenantFeature,
      WorkflowInstance,
      EventLog,
    ]),
    FeatureModule,
    IntegrationModule,
    AuditModule,
    EventModule,
    TenantModule,
  ],
  controllers: [AdministrationController],
  providers: [
    UserManagementService,
    TeamManagementService,
    RoleManagementService,
    PermissionManagementService,
    FeatureManagementService,
    ApiKeyManagementService,
    WebhookManagementService,
    SettingsManagementService,
    LoginHistoryService,
    CopilotSettingsService,
    AdminDashboardService,
    AdminMetricsService,
    AdminObservabilityInterceptor,
    AdminOnlyGuard,
    AdminRateLimitGuard,
    StepUpService,
    StepUpGuard,
    LoginHistoryRetentionJob,
    AuditArchiveJob,
    BreakGlassService,
    AdminTracingInterceptor,
  ],
  exports: [LoginHistoryService, StepUpService, StepUpGuard],
})
export class AdministrationModule {}
