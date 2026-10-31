import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AutomationWorkflowService } from './automation-workflow.service';
import { CreateDefinitionDto, UpdateDefinitionDto } from './dto/automation-workflow.dto';

@ApiTags('Automation Workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@Controller('automation/workflows')
export class AutomationWorkflowController {
  constructor(private readonly service: AutomationWorkflowService) {}

  @Get('definitions')
  @RequirePermission('automation.manage')
  @ApiOperation({ summary: 'List workflow definitions' })
  listDefinitions() {
    return this.service.listDefinitions();
  }

  @Post('definitions')
  @RequirePermission('automation.manage')
  @ApiOperation({ summary: 'Create workflow definition' })
  createDefinition(@Body() dto: CreateDefinitionDto) {
    return this.service.createDefinition(dto);
  }

  @Get('definitions/:id')
  @RequirePermission('automation.manage')
  getDefinition(@Param('id') id: string) {
    return this.service.getDefinition(id);
  }

  @Put('definitions/:id')
  @RequirePermission('automation.manage')
  updateDefinition(@Param('id') id: string, @Body() dto: UpdateDefinitionDto) {
    return this.service.updateDefinition(id, dto);
  }

  @Delete('definitions/:id')
  @RequirePermission('automation.manage')
  deleteDefinition(@Param('id') id: string) {
    return this.service.deleteDefinition(id);
  }

  @Post('definitions/:id/activate')
  @RequirePermission('automation.manage')
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Post('definitions/:id/deactivate')
  @RequirePermission('automation.manage')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Get('instances')
  @RequirePermission('automation.manage')
  listInstances() {
    return this.service.listInstances();
  }

  @Get('instances/:id')
  @RequirePermission('automation.manage')
  getInstance(@Param('id') id: string) {
    return this.service.getInstance(id);
  }

  @Get('instances/:id/executions')
  @RequirePermission('automation.manage')
  getExecutions(@Param('id') id: string) {
    return this.service.getExecutions(id);
  }

  @Post('instances/:id/retry')
  @RequirePermission('automation.manage')
  retry(@Param('id') id: string) {
    return this.service.retryInstance(id);
  }
}
