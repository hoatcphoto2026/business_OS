import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(data: {
    userId: string;
    title: string;
    body?: string;
    type?: string;
    channel?: string;
    data?: Record<string, unknown>;
    eventType?: string;
  }): Promise<Notification> {
    const tenantId = this.tenantContext.tryGetTenantId() || (data as any).tenantId;
    const n = this.notifRepo.create({
      tenantId,
      userId: data.userId,
      title: data.title,
      body: data.body ?? null,
      type: data.type ?? 'info',
      channel: data.channel ?? 'in_app',
      status: 'unread',
      data: data.data ?? null,
      eventType: data.eventType ?? null,
      createdBy: data.userId,
    });
    return this.notifRepo.save(n);
  }

  async findForCurrentUser(limit = 50): Promise<Notification[]> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.getCurrentUserId();
    return this.notifRepo.find({
      where: { tenantId, userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async unreadCount(): Promise<number> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.getCurrentUserId();
    return this.notifRepo.count({ where: { tenantId, userId, status: 'unread' } });
  }

  async markRead(id: string): Promise<Notification> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.getCurrentUserId();
    const n = await this.notifRepo.findOne({ where: { id, tenantId, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    n.status = 'read';
    n.readAt = new Date();
    return this.notifRepo.save(n);
  }

  async markAllRead(): Promise<{ updated: number }> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.getCurrentUserId();
    const result = await this.notifRepo.update(
      { tenantId, userId, status: 'unread' },
      { status: 'read', readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  // Templates
  async findTemplates(): Promise<NotificationTemplate[]> {
    const tenantId = this.tenantContext.tryGetTenantId();
    return this.templateRepo.find({
      where: tenantId ? [{ tenantId }, { tenantId: null as any }] : {},
      order: { code: 'ASC' },
    });
  }

  async createTemplate(data: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const t = this.templateRepo.create({ ...data, tenantId });
    return this.templateRepo.save(t);
  }
}
