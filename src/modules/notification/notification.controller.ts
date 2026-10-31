import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { NotificationService, SendNotificationDto } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Notification Center')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  list(@Query('limit') limit?: string) {
    return this.service.findForCurrentUser(limit ? parseInt(limit, 10) : 50);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count' })
  unreadCount() {
    return this.service.unreadCount().then((count) => ({ count }));
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead() {
    return this.service.markAllRead();
  }

  @Post()
  @ApiOperation({ summary: 'Create a raw notification (internal)' })
  create(@Body() body: any) {
    if (!body?.userId || !body?.title) {
      throw new BadRequestException('userId and title are required');
    }
    return this.service.create(body);
  }

  @Post('send')
  @ApiOperation({
    summary: 'Send notification using template + channels (EMAIL/SMS/WEBHOOK/IN_APP)',
  })
  @ApiResponse({ status: 201, description: 'Notification + delivery logs' })
  send(@Body() dto: SendNotificationDto) {
    return this.service.send(dto);
  }

  @Post('retry-failed')
  @ApiOperation({ summary: 'Retry FAILED deliveries (max 3 attempts)' })
  retryFailed() {
    return this.service.retryFailed();
  }

  @Get('templates')
  @ApiOperation({ summary: 'List notification templates' })
  templates() {
    return this.service.findTemplates();
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a notification template' })
  createTemplate(@Body() body: any) {
    return this.service.createTemplate(body);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for notifications' })
  metrics() {
    return this.service.getPrometheusText();
  }
}
