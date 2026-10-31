import { Controller, Post, Get, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { WorkflowDefinitionService, CreateWorkflowDto } from './workflow-definition.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionGuard } from '../../rbac/guards/permission.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@ApiTags('Workflow Engine')
@ApiBearerAuth()
@Controller('workflow-definitions')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class WorkflowDefinitionController {
  constructor(private readonly service: WorkflowDefinitionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a workflow definition (with versioning)' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateWorkflowDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workflow definitions for current tenant' })
  list() {
    return this.service.list();
  }

  @Get('executions')
  @ApiOperation({ summary: 'List workflow executions' })
  @ApiQuery({ name: 'definitionId', required: false })
  listExecutions(@Query('definitionId') definitionId?: string) {
    return this.service.listExecutions(definitionId);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for workflow engine' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow definition with nodes and transitions' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute a workflow definition' })
  execute(@Param('id') id: string, @Body() body: { input?: Record<string, unknown> }) {
    return this.service.execute(id, body?.input ?? {});
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable a workflow' })
  enable(@Param('id') id: string) {
    return this.service.setEnabled(id, true);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable a workflow' })
  disable(@Param('id') id: string) {
    return this.service.setEnabled(id, false);
  }

  @Post('executions/:executionId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a FAILED execution' })
  retry(@Param('executionId') executionId: string) {
    return this.service.retry(executionId);
  }
}
