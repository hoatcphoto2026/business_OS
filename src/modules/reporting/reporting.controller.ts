import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { ReportingService } from './reporting.service';
import { ReportType } from './enums/reporting.enum';
import {
  CreateReportScheduleDto,
  ExportReportQueryDto,
  ReportPeriodDto,
  RunHistoryQueryDto,
  RunReportDto,
  UpdateReportScheduleDto,
} from './dto/reporting.dto';

@ApiTags('Enterprise Reporting')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  // ─── Catalog / history / metrics ─────────────────────────────

  @Get('catalog')
  @ApiOperation({ summary: 'List the seven built-in reports and their export columns' })
  catalog() {
    return this.reporting.catalog();
  }

  @Get('runs')
  @ApiOperation({ summary: 'Report run history (newest first)' })
  @ApiQuery({ name: 'reportType', required: false, enum: ReportType })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  runs(@Query() query: RunHistoryQueryDto) {
    return this.reporting.listRuns(query);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Report run detail with delivery attempts' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  run(@Param('id', ParseUUIDPipe) id: string) {
    return this.reporting.getRun(id);
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics for report runs/exports/deliveries' })
  metrics() {
    return this.reporting.metricsText();
  }

  // ─── Schedules (daily / weekly / monthly) ────────────────────

  @Get('schedules')
  @ApiOperation({ summary: 'List report schedules' })
  schedules() {
    return this.reporting.listSchedules();
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Create a daily/weekly/monthly report schedule' })
  createSchedule(@Body() dto: CreateReportScheduleDto) {
    return this.reporting.createSchedule(dto);
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get one report schedule' })
  schedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.reporting.getSchedule(id);
  }

  @Patch('schedules/:id')
  @ApiOperation({ summary: 'Update schedule frequency, format or delivery targets' })
  updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportScheduleDto,
  ) {
    return this.reporting.updateSchedule(id, dto);
  }

  @Post('schedules/:id/run')
  @ApiOperation({ summary: 'Run a schedule immediately (generates + delivers)' })
  runSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.reporting.runSchedule(id);
  }

  // ─── Reports by type ─────────────────────────────────────────

  @Get(':type')
  @ApiOperation({ summary: 'Generate a report as JSON' })
  @ApiParam({ name: 'type', enum: ReportType })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date/time' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date/time' })
  report(
    @Param('type', new ParseEnumPipe(ReportType)) type: ReportType,
    @Query() query: ReportPeriodDto,
  ) {
    return this.reporting.generate(type, query.from, query.to);
  }

  @Get(':type/export')
  @ApiOperation({ summary: 'Export a report as CSV, Excel or PDF' })
  @ApiParam({ name: 'type', enum: ReportType })
  @ApiProduces('text/csv', 'application/vnd.ms-excel', 'application/pdf')
  async export(
    @Param('type', new ParseEnumPipe(ReportType)) type: ReportType,
    @Query() query: ExportReportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reporting.export(type, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.buffer);
  }

  @Post(':type/run')
  @ApiOperation({ summary: 'Generate a report, persist the run and deliver it' })
  @ApiParam({ name: 'type', enum: ReportType })
  runReport(
    @Param('type', new ParseEnumPipe(ReportType)) type: ReportType,
    @Body() dto: RunReportDto,
  ) {
    return this.reporting.run(type, dto);
  }
}
