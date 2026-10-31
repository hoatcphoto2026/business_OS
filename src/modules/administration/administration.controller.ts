import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AdminOnlyGuard } from './guards/admin-only.guard';
import { AdminRateLimitGuard } from './guards/admin-rate-limit.guard';
import { StepUpGuard } from './guards/step-up.guard';
import { RequireStepUp } from './decorators/require-step-up.decorator';
import { AdminObservabilityInterceptor } from './interceptors/admin-observability.interceptor';
import { AdminMetricsService } from './services/admin-metrics.service';
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
import { StepUpService } from './services/step-up.service';
import { LoginHistoryRetentionJob } from './jobs/login-history-retention.job';
import { BreakGlassService } from './services/break-glass.service';
import { AuditArchiveJob } from './jobs/audit-archive.job';
import { AdminApi } from './openapi/admin-api.decorator';
import {
  UserResponseDto,
  ApiKeyCreatedResponseDto,
  StepUpInitiateResponseDto,
  StepUpVerifyResponseDto,
  AdminMetricsResponseDto,
} from './dto/responses.dto';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import {
  CreateUserDto,
  UpdateUserDto,
  CreateRoleDto,
  UpdateRoleDto,
  AssignPermissionDto,
  CreateTeamDto,
  UpdateTeamDto,
  CreateWebhookDto,
  UpdateWebhookDto,
  CreateApiKeyDto,
  UpdateSettingsDto,
  UpdateCopilotSettingsDto,
  StepUpInitiateDto,
  StepUpVerifyDto,
} from './dto/admin.dto';

@ApiTags('Administration Center')
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantGuard, AdminOnlyGuard, AdminRateLimitGuard, StepUpGuard)
@UseInterceptors(AdminObservabilityInterceptor)
export class AdministrationController {
  constructor(
    private readonly users: UserManagementService,
    private readonly teams: TeamManagementService,
    private readonly roles: RoleManagementService,
    private readonly permissions: PermissionManagementService,
    private readonly features: FeatureManagementService,
    private readonly apiKeys: ApiKeyManagementService,
    private readonly webhooks: WebhookManagementService,
    private readonly settings: SettingsManagementService,
    private readonly loginHistory: LoginHistoryService,
    private readonly copilotSettings: CopilotSettingsService,
    private readonly dashboard: AdminDashboardService,
    private readonly metrics: AdminMetricsService,
    private readonly stepUp: StepUpService,
    private readonly retention: LoginHistoryRetentionJob,
    private readonly breakGlass: BreakGlassService,
    private readonly auditArchive: AuditArchiveJob,
  ) {}

  @Get('metrics')
  @AdminApi({ summary: 'Admin metrics snapshot (60s window)', auditAction: 'metrics.read' })
  @ApiResponse({ status: 200, type: AdminMetricsResponseDto })
  getMetrics() {
    return this.metrics.snapshot();
  }

  @Get('metrics/prometheus')
  @AdminApi({ summary: 'Prometheus text metrics', auditAction: 'metrics.read' })
  getPrometheusMetrics() {
    return this.metrics.prometheus();
  }

  // Step-Up Authentication
  @Post('step-up/initiate')
  @AdminApi({ summary: 'Initiate step-up challenge', auditAction: 'stepup.initiate' })
  @ApiResponse({ status: 201, type: StepUpInitiateResponseDto })
  initiateStepUp(@Body() body: StepUpInitiateDto, @Req() req: any) {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    const tenantId = req.tenantId || req.user?.tenantId;
    return this.stepUp.initiate(tenantId, userId, body.action, body.method || 'totp', req.ip);
  }

  @Post('step-up/verify')
  @AdminApi({ summary: 'Verify step-up code and obtain token', auditAction: 'stepup.verify' })
  @ApiResponse({ status: 200, type: StepUpVerifyResponseDto })
  verifyStepUp(@Body() body: StepUpVerifyDto, @Req() req: any) {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    const tenantId = req.tenantId || req.user?.tenantId;
    return this.stepUp.verify(body.sessionId, tenantId, userId, body.code);
  }

  // Dashboard
  @Get('dashboard')
  getDashboard() {
    return this.dashboard.getDashboard();
  }

  // Users
  @Get('users')
  @AdminApi({ summary: 'List users of current tenant', auditAction: 'user.list' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  listUsers() {
    return this.users.list();
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post('users')
  @AdminApi({ summary: 'Create user + membership', auditAction: 'user.create', eventType: 'UserCreated' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  createUser(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }

  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.users.update(id, body);
  }

  @Delete('users/:id')
  @RequireStepUp('user.delete')
  @AdminApi({ summary: 'Remove user from tenant', auditAction: 'user.delete', eventType: 'UserDeleted', stepUp: true })
  deleteUser(@Param('id') id: string) {
    return this.users.remove(id);
  }

  // Teams
  @Get('teams')
  listTeams() {
    return this.teams.list();
  }

  @Post('teams')
  createTeam(@Body() body: CreateTeamDto) {
    return this.teams.create(body);
  }

  @Put('teams/:id')
  updateTeam(@Param('id') id: string, @Body() body: UpdateTeamDto) {
    return this.teams.update(id, body);
  }

  @Delete('teams/:id')
  deleteTeam(@Param('id') id: string) {
    return this.teams.remove(id);
  }

  // Roles
  @Get('roles')
  listRoles() {
    return this.roles.list();
  }

  @Get('roles/:id')
  getRole(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Post('roles')
  createRole(@Body() body: CreateRoleDto) {
    return this.roles.create(body);
  }

  @Put('roles/:id')
  updateRole(@Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.roles.update(id, body);
  }

  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.roles.remove(id);
  }

  // Permissions
  @Get('permissions')
  listPermissions() {
    return this.permissions.list();
  }

  @Post('roles/:id/permissions')
  @RequireStepUp('permission.assign')
  assignPermission(@Param('id') roleId: string, @Body() body: AssignPermissionDto) {
    return this.roles.assignPermission(roleId, body.permissionId);
  }

  @Delete('roles/:id/permissions/:permissionId')
  @RequireStepUp('permission.revoke')
  revokePermission(@Param('id') roleId: string, @Param('permissionId') permissionId: string) {
    return this.roles.revokePermission(roleId, permissionId);
  }

  // Features
  @Get('features')
  listFeatures() {
    return this.features.list();
  }

  @Post('features/:code/enable')
  enableFeature(@Param('code') code: string) {
    return this.features.enable(code);
  }

  @Post('features/:code/disable')
  @RequireStepUp('feature.disable')
  @AdminApi({ summary: 'Disable feature for tenant', auditAction: 'feature.disable', eventType: 'FeatureDisabled', stepUp: true, rbac: 'owner' })
  disableFeature(@Param('code') code: string) {
    return this.features.disable(code);
  }

  // API Keys
  @Get('api-keys')
  listApiKeys() {
    return this.apiKeys.list();
  }

  @Post('api-keys')
  @RequireStepUp('apikey.create')
  @AdminApi({ summary: 'Create API Key (plaintext once)', auditAction: 'apikey.create', eventType: 'ApiKeyCreated', stepUp: true })
  @ApiResponse({ status: 201, type: ApiKeyCreatedResponseDto })
  createApiKey(@Body() body: CreateApiKeyDto) {
    return this.apiKeys.create(body.name, body.expiresAt ? new Date(body.expiresAt) : undefined);
  }

  @Delete('api-keys/:id')
  @RequireStepUp('apikey.revoke')
  revokeApiKey(@Param('id') id: string) {
    return this.apiKeys.revoke(id);
  }

  // Webhooks
  @Get('webhooks')
  listWebhooks() {
    return this.webhooks.list();
  }

  @Post('webhooks')
  @RequireStepUp('webhook.create')
  @AdminApi({ summary: 'Create webhook endpoint', auditAction: 'webhook.create', eventType: 'WebhookCreated', stepUp: true })
  createWebhook(@Body() body: CreateWebhookDto) {
    return this.webhooks.create(body);
  }

  @Put('webhooks/:id')
  updateWebhook(@Param('id') id: string, @Body() body: UpdateWebhookDto) {
    return this.webhooks.update(id, body);
  }

  @Delete('webhooks/:id')
  @RequireStepUp('webhook.delete')
  deleteWebhook(@Param('id') id: string) {
    return this.webhooks.remove(id);
  }

  // Tenant Settings
  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  updateSettings(@Body() body: UpdateSettingsDto) {
    return this.settings.update(body);
  }

  // Login History
  @Get('login-history')
  listLoginHistory() {
    return this.loginHistory.list();
  }

  // Copilot Settings
  @Get('copilot-settings')
  getCopilotSettings() {
    return this.copilotSettings.get();
  }

  @Put('copilot-settings')
  updateCopilotSettings(@Body() body: UpdateCopilotSettingsDto) {
    return this.copilotSettings.update(body);
  }

  @Post('jobs/retention/run')
  @AdminApi({ summary: 'Manually trigger login history retention job', auditAction: 'retention.run', rbac: 'owner' })
  runRetention() {
    return this.retention.runNow();
  }

  @Post('jobs/audit-archive/run')
  @AdminApi({ summary: 'Manually trigger audit archive job', auditAction: 'audit.archive', rbac: 'owner' })
  runAuditArchive() {
    return this.auditArchive.runNow();
  }

  // Break-Glass Dual-Control
  @Post('break-glass/request')
  @AdminApi({ summary: 'Request emergency break-glass access', auditAction: 'breakglass.request' })
  requestBreakGlass(@Body() body: { reason: string }, @Req() req: any) {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    const tenantId = req.tenantId || req.user?.tenantId;
    return this.breakGlass.request(tenantId, userId, body.reason);
  }

  @Post('break-glass/:id/approve')
  @AdminApi({ summary: 'Approve break-glass request (dual-control)', auditAction: 'breakglass.approve' })
  approveBreakGlass(@Param('id') id: string, @Req() req: any) {
    const approverId = req.user?.id || req.user?.sub;
    return this.breakGlass.approve(id, approverId);
  }

  @Get('break-glass/pending')
  @AdminApi({ summary: 'List pending break-glass requests' })
  listPendingBreakGlass(@Req() req: any) {
    const tenantId = req.tenantId || req.user?.tenantId;
    return this.breakGlass.listPending(tenantId);
  }
}

