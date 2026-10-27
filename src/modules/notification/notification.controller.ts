import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.service.findForCurrentUser(limit ? parseInt(limit, 10) : 50);
  }

  @Get('unread-count')
  unreadCount() {
    return this.service.unreadCount().then((count) => ({ count }));
  }

  @Put(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }

  @Put('read-all')
  markAllRead() {
    return this.service.markAllRead();
  }

  @Post()
  create(@Body() body: any) {
    if (!body?.userId || !body?.title) {
      throw new BadRequestException('userId and title are required');
    }
    return this.service.create(body);
  }

  @Get('templates')
  templates() {
    return this.service.findTemplates();
  }

  @Post('templates')
  createTemplate(@Body() body: any) {
    return this.service.createTemplate(body);
  }
}
