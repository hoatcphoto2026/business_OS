import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CompliancePlatformService } from './compliance-platform.service';
import {
  ComplianceReportQueryDto,
  ExportAuditEventDto,
  RetentionQueryDto,
  SearchAuditEventDto,
} from './dto/compliance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Audit & Compliance')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('audit.view')
export class CompliancePlatformController {
  constructor(private readonly compliance: CompliancePlatformService) {}

  @Get()
  @ApiOperation({ summary: 'List audit events for the current tenant' })
  list(@Query() query: SearchAuditEventDto) {
    return this.compliance.list(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Advanced audit search' })
  search(@Query() query: SearchAuditEventDto) {
    return this.compliance.search(query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit events as CSV, Excel, or PDF' })
  @ApiProduces('text/csv', 'application/vnd.ms-excel', 'application/pdf')
  async export(@Query() query: ExportAuditEventDto, @Res() res: Response) {
    const file = await this.compliance.export(query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  }

  @Get('reports')
  @ApiOperation({ summary: 'User, billing, security, or suspicious-activity compliance report' })
  reports(@Query() query: ComplianceReportQueryDto) {
    return this.compliance.report(query);
  }

  @Get('retention')
  @ApiOperation({ summary: 'Retention policies: 90, 180, 365 days, and custom' })
  retention(@Query() query: RetentionQueryDto) {
    return this.compliance.retention(query);
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics for audit compliance' })
  metrics() {
    return this.compliance.metrics();
  }
}
