import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { CreateScheduledJobDto } from './dto/create-scheduled-job.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Scheduled Jobs')
@ApiBearerAuth()
@Controller('jobs')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class ScheduledJobsController {
  constructor(private readonly service: ScheduledJobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a scheduled job' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateScheduledJobDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List scheduled jobs for current tenant' })
  list() {
    return this.service.list();
  }

  @Get('history')
  @ApiOperation({ summary: 'List job execution history' })
  @ApiQuery({ name: 'jobId', required: false })
  history(@Query('jobId') jobId?: string) {
    return this.service.listHistory(jobId);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for scheduled jobs' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a scheduled job' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually run a scheduled job' })
  run(@Param('id') id: string) {
    return this.service.run(id);
  }
}
