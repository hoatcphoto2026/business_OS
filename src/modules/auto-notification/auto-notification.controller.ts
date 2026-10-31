import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AutoNotificationService } from './auto-notification.service';
import { TriggerAutoNotifyDto } from './dto/trigger-auto-notify.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Auto Notification')
@ApiBearerAuth()
@Controller('auto-notifications')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class AutoNotificationController {
  constructor(private readonly service: AutoNotificationService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger automatic notifications across channels' })
  @ApiResponse({ status: 201 })
  trigger(@Body() dto: TriggerAutoNotifyDto) {
    return this.service.trigger(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List auto notification logs' })
  list() {
    return this.service.list();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for auto notification' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed delivery' })
  @ApiParam({ name: 'id' })
  retry(@Param('id') id: string) {
    return this.service.retry(id);
  }
}
