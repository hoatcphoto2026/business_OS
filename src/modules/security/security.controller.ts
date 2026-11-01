import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { StepUpGuard } from '../administration/guards/step-up.guard';
import { RequireStepUp } from '../administration/decorators/require-step-up.decorator';
import { SecurityEventsService } from './services/security-events.service';
import { ThreatDetectionService } from './services/threat-detection.service';
import { AlertRulesService } from './services/alert-rules.service';
import { SecretRotationService } from './services/secret-rotation.service';
import { EmergencyAccessService } from './services/emergency-access.service';
import { LoginAttemptService } from './services/login-attempt.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  CreateAlertRuleDto,
  DetectQueryDto,
  EmergencyAccessDecisionDto,
  EmergencyAccessRequestDto,
  LoginAttemptQueryDto,
  RotateSecretDto,
  SecurityEventNotesDto,
  SecurityEventQueryDto,
  UpdateAlertRuleDto,
} from './dto/security.dto';

@ApiTags('Enterprise Security')
@ApiBearerAuth()
@Controller('security')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class SecurityController {
  constructor(
    private readonly events: SecurityEventsService,
    private readonly detection: ThreatDetectionService,
    private readonly alerts: AlertRulesService,
    private readonly rotations: SecretRotationService,
    private readonly emergency: EmergencyAccessService,
    private readonly loginAttempts: LoginAttemptService,
    private readonly metricsService: MetricsService,
  ) {}

  // ─── Dashboard / threat monitoring ───────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Security posture + threat monitoring summary' })
  async dashboard(@Req() req: any) {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    return {
      generatedAt: new Date().toISOString(),
      events: await this.events.stats(),
      monitoring: await this.detection.monitoring(),
      emergencyAccessActive: await this.emergency.isActive(userId),
    };
  }

  @Get('threats')
  @ApiOperation({ summary: 'Threat monitoring: top IPs/identities + open critical events' })
  threats() {
    return this.detection.monitoring();
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics (shared registry)' })
  metrics() {
    return this.metricsService.text();
  }

  // ─── Security events ─────────────────────────────────────────

  @Get('events')
  @ApiOperation({ summary: 'List security events (filter by status/type/severity)' })
  listEvents(@Query() query: SecurityEventQueryDto) {
    return this.events.list(query);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get one security event' })
  getEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.events.get(id);
  }

  @Post('events/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge a security event' })
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SecurityEventNotesDto,
  ) {
    return this.events.acknowledge(id, dto.notes);
  }

  @Post('events/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a security event' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SecurityEventNotesDto,
  ) {
    return this.events.resolve(id, dto.notes);
  }

  @Get('audit-trail')
  @ApiOperation({ summary: 'Security audit trail (security module audit logs)' })
  auditTrail() {
    return this.events.auditTrail();
  }

  // ─── Detections ──────────────────────────────────────────────

  @Post('detect/failed-logins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect brute-force / repeated failed logins' })
  detectFailedLogins(@Body() query: DetectQueryDto) {
    return this.detection.detectFailedLogins(query);
  }

  @Post('detect/suspicious-activity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect multi-IP logins and failed-then-success patterns' })
  detectSuspicious(@Body() query: DetectQueryDto) {
    return this.detection.detectSuspiciousActivity(query);
  }

  @Post('detect/geo-anomalies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect logins from countries outside the learned baseline' })
  detectGeo() {
    return this.detection.detectGeoAnomalies();
  }

  @Post('detect/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run every detection (failed login, suspicious, geo)' })
  detectAll(@Body() query: DetectQueryDto) {
    return this.detection.detectAll(query);
  }

  // ─── Login signals ───────────────────────────────────────────

  @Get('login-attempts')
  @ApiOperation({ summary: 'Recent login attempts (success/failure)' })
  listAttempts(@Query() query: LoginAttemptQueryDto) {
    const success =
      query.success === undefined ? undefined : query.success === 'true';
    return this.loginAttempts.recent(query.limit ?? 100, success);
  }

  @Get('login-locations')
  @ApiOperation({ summary: 'Learned geo baseline per user' })
  locations() {
    return this.loginAttempts.locationsForTenant();
  }

  // ─── Alert rules ─────────────────────────────────────────────

  @Get('alert-rules')
  @ApiOperation({ summary: 'List tenant alert rules' })
  listAlertRules() {
    return this.alerts.list();
  }

  @Post('alert-rules')
  @ApiOperation({ summary: 'Create an alert rule (threshold + window)' })
  createAlertRule(@Body() dto: CreateAlertRuleDto) {
    return this.alerts.create(dto);
  }

  @Patch('alert-rules/:id')
  @ApiOperation({ summary: 'Update an alert rule' })
  updateAlertRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alerts.update(id, dto);
  }

  // ─── Secret rotation (step-up protected) ─────────────────────

  @Get('rotations')
  @ApiOperation({ summary: 'Secret rotation history' })
  listRotations() {
    return this.rotations.list();
  }

  @Post('rotations/api-keys/:id')
  @UseGuards(StepUpGuard)
  @RequireStepUp('security.rotate-api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate an API key (new plaintext returned once)' })
  rotateApiKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateSecretDto,
  ) {
    return this.rotations.rotateApiKey(id, dto);
  }

  @Post('rotations/scim-endpoints/:id')
  @UseGuards(StepUpGuard)
  @RequireStepUp('security.rotate-scim-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a SCIM endpoint token (returned once)' })
  rotateScimToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateSecretDto,
  ) {
    return this.rotations.rotateScimToken(id, dto);
  }

  @Post('rotations/webhooks/:id')
  @UseGuards(StepUpGuard)
  @RequireStepUp('security.rotate-webhook-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a webhook signing secret (returned once)' })
  rotateWebhookSecret(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateSecretDto,
  ) {
    return this.rotations.rotateWebhookSecret(id, dto);
  }

  // ─── Emergency access / break-glass (dual control + step-up) ─

  @Get('emergency-access')
  @ApiOperation({ summary: 'List emergency access requests (auto-expires stale grants)' })
  listEmergencyAccess() {
    return this.emergency.list();
  }

  @Post('emergency-access')
  @ApiOperation({ summary: 'Request emergency (break-glass) access' })
  requestEmergencyAccess(@Body() dto: EmergencyAccessRequestDto) {
    return this.emergency.request(dto);
  }

  @Post('emergency-access/:id/approve')
  @UseGuards(StepUpGuard)
  @RequireStepUp('security.emergency-access')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve emergency access (must be a different admin)' })
  approveEmergencyAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmergencyAccessDecisionDto,
  ) {
    return this.emergency.approve(id, dto);
  }

  @Post('emergency-access/:id/revoke')
  @UseGuards(StepUpGuard)
  @RequireStepUp('security.emergency-access')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an emergency access grant' })
  revokeEmergencyAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmergencyAccessDecisionDto,
  ) {
    return this.emergency.revoke(id, dto);
  }
}

