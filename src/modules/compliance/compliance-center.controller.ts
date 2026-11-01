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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ComplianceEvidenceService } from './compliance-evidence.service';
import { ComplianceReviewService } from './compliance-review.service';
import { ComplianceCenterService } from './compliance-center.service';
import {
  CollectEvidenceDto,
  CompleteAccessReviewDto,
  CreateAccessReviewDto,
  CreateEvidenceDto,
  CreateRiskDto,
  EvidenceQueryDto,
  ExportQueryDto,
  RiskQueryDto,
  SnapshotQueryDto,
  UpdateRiskDto,
  VerifyEvidenceDto,
} from './dto/compliance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

/**
 * Compliance Center (EPIC C5) – evidence, access/permission reviews, risks,
 * retention/security reports, dashboard, snapshots, analytics and exports.
 */
@ApiTags('Compliance Center')
@ApiBearerAuth()
@Controller('compliance')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class ComplianceCenterController {
  constructor(
    private readonly evidence: ComplianceEvidenceService,
    private readonly reviews: ComplianceReviewService,
    private readonly center: ComplianceCenterService,
  ) {}

  // ─── Dashboard / analytics / metrics ─────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Compliance dashboard with live scores and counts' })
  dashboard() {
    return this.center.dashboard();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Score trend + evidence/risk/review breakdowns' })
  analytics(@Query() query: SnapshotQueryDto) {
    return this.center.analytics(query.limit ?? 20);
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics for the compliance center' })
  metrics() {
    return this.center.metricsText();
  }

  // ─── Evidence ────────────────────────────────────────────────

  @Post('evidence')
  @ApiOperation({ summary: 'Register a manual evidence record (hash is computed)' })
  createEvidence(@Body() dto: CreateEvidenceDto) {
    return this.evidence.create(dto);
  }

  @Post('evidence/collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Collect evidence automatically from platform sources' })
  collectEvidence(@Body() dto: CollectEvidenceDto) {
    return this.evidence.collect(dto);
  }

  @Get('evidence')
  @ApiOperation({ summary: 'List evidence records' })
  listEvidence(@Query() query: EvidenceQueryDto) {
    return this.evidence.list(query);
  }

  @Get('evidence/export')
  @ApiOperation({ summary: 'Export evidence as CSV, Excel, or PDF' })
  @ApiProduces('text/csv', 'application/vnd.ms-excel', 'application/pdf')
  async exportEvidence(@Query() query: ExportQueryDto, @Res() res: Response) {
    const file = await this.evidence.export(query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.buffer);
  }

  @Get('evidence/:id')
  @ApiOperation({ summary: 'Get one evidence record' })
  getEvidence(@Param('id', ParseUUIDPipe) id: string) {
    return this.evidence.get(id);
  }

  @Post('evidence/:id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark evidence as verified' })
  verifyEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyEvidenceDto,
  ) {
    return this.evidence.verify(id, dto.notes);
  }

  // ─── Access & permission reviews ─────────────────────────────

  @Post('access-reviews')
  @ApiOperation({ summary: 'Start an access review (snapshots memberships + roles)' })
  startReview(@Body() dto: CreateAccessReviewDto) {
    return this.reviews.startReview(dto);
  }

  @Get('access-reviews')
  @ApiOperation({ summary: 'List access reviews' })
  listReviews() {
    return this.reviews.listReviews();
  }

  @Get('access-reviews/:id')
  @ApiOperation({ summary: 'Get an access review with findings' })
  getReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.getReview(id);
  }

  @Post('access-reviews/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an access review' })
  completeReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteAccessReviewDto,
  ) {
    return this.reviews.completeReview(id, dto);
  }

  @Get('permission-review')
  @ApiOperation({ summary: 'Role to permission matrix with risky assignments' })
  permissionReview() {
    return this.reviews.permissionReview();
  }

  // ─── Risks ───────────────────────────────────────────────────

  @Post('risks')
  @ApiOperation({ summary: 'Create a risk assessment (score = likelihood x impact)' })
  createRisk(@Body() dto: CreateRiskDto) {
    return this.center.createRisk(dto);
  }

  @Get('risks')
  @ApiOperation({ summary: 'List risks (filter by status/severity)' })
  listRisks(@Query() query: RiskQueryDto) {
    return this.center.listRisks(query);
  }

  @Patch('risks/:id')
  @ApiOperation({ summary: 'Update risk status/severity/likelihood/impact' })
  updateRisk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRiskDto,
  ) {
    return this.center.updateRisk(id, dto);
  }

  // ─── Reports ─────────────────────────────────────────────────

  @Get('reports/risks')
  @ApiOperation({ summary: 'Risk report: severity/status breakdown + top risks' })
  riskReport() {
    return this.center.riskReport();
  }

  @Get('reports/retention')
  @ApiOperation({ summary: 'Retention report: policies + aged record counts' })
  retentionReport() {
    return this.center.retentionReport();
  }

  @Get('reports/security')
  @ApiOperation({ summary: 'Security report: SSO/SCIM/step-up/monitoring checks' })
  securityReport() {
    return this.center.securityReport();
  }

  // ─── Snapshots ───────────────────────────────────────────────

  @Post('snapshots')
  @ApiOperation({ summary: 'Generate a compliance snapshot with scores' })
  generateSnapshot() {
    return this.center.generateSnapshot();
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List compliance snapshots (newest first)' })
  listSnapshots(@Query() query: SnapshotQueryDto) {
    return this.center.listSnapshots(query.limit ?? 20);
  }
}
