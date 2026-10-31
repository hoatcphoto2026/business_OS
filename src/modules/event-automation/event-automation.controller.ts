import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { EventAutomationService } from './event-automation.service';
import { AutomationStatus } from './enums/automation.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Event Automation')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class EventAutomationController {
  constructor(private readonly service: EventAutomationService) {}

  @Get()
  @ApiOperation({ summary: 'List automation logs for current tenant' })
  @ApiQuery({ name: 'status', required: false, enum: AutomationStatus })
  list(@Query('status') status?: AutomationStatus) {
    return this.service.list(status);
  }

  @Get('failures')
  @ApiOperation({ summary: 'List failed and dead-letter events' })
  failures() {
    return this.service.listFailures();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for event automation' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Post('replay/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replay a failed or dead-letter event' })
  @ApiParam({ name: 'id', description: 'Automation log UUID' })
  @ApiResponse({ status: 200 })
  replay(@Param('id') id: string) {
    return this.service.replay(id);
  }
}
