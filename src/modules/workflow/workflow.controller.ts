import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowActionDto } from './dto/workflow.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@Controller('workflows')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class WorkflowController {
  constructor(private readonly workflowEngine: WorkflowEngineService) {}

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowEngine.getById(id);
  }

  @Get(':id/history')
  getHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowEngine.getHistory(id);
  }

  @Post(':id/submit')
  @RequirePermission('sales.create')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowActionDto,
  ) {
    return this.workflowEngine.submit(id, body.comment);
  }

  @Post(':id/approve')
  @RequirePermission('admin.access')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowActionDto,
  ) {
    return this.workflowEngine.approve(id, body.comment);
  }

  @Post(':id/reject')
  @RequirePermission('admin.access')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowActionDto,
  ) {
    return this.workflowEngine.reject(id, body.comment);
  }

  @Post(':id/post')
  @RequirePermission('admin.access')
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowActionDto,
  ) {
    return this.workflowEngine.post(id, body.comment);
  }

  @Post(':id/cancel')
  @RequirePermission('admin.access')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowActionDto,
  ) {
    return this.workflowEngine.cancel(id, body.comment);
  }

  @Post(':id/close')
  @RequirePermission('admin.access')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkflowActionDto,
  ) {
    return this.workflowEngine.close(id, body.comment);
  }
}
