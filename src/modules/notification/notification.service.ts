import { MetricsService } from '../../common/metrics/metrics.service';
import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationDeliveryLog, DeliveryStatus, NotificationChannel } from './entities/notification-delivery-log.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

export interface SendNotificationDto {
  userId?: string;
  templateCode?: string;
  title?: string;
  body?: string;
  channels?: NotificationChannel[];
  variables?: Record<string, string | number>;
  eventType?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(NotificationDeliveryLog)
    private readonly deliveryRepo: Repository<NotificationDeliveryLog>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  // ──────────────────────────────────────────────
  // Template engine
  // ──────────────────────────────────────────────

  private renderTemplate(template: string, vars: Record<string, string | number> = {}): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = vars[key];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }

  // ──────────────────────────────────────────────
  // Core CRUD (existing + enhancements)
  // ──────────────────────────────────────────────

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
    const saved = await this.notifRepo.save(n);
    this.metricsService.inc('notifications_created_total');
    return saved;
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

  // ──────────────────────────────────────────────
  // Send with template + multi-channel + retry
  // ──────────────────────────────────────────────

  async send(dto: SendNotificationDto): Promise<{ notification: Notification; deliveries: NotificationDeliveryLog[] }> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = dto.userId || this.tenantContext.getCurrentUserId();
    if (!userId) throw new BadRequestException('userId required');

    let title = dto.title || 'Notification';
    let body = dto.body || '';

    if (dto.templateCode) {
      const tmpl = await this.templateRepo.findOne({
        where: { code: dto.templateCode, active: true },
      });
      if (tmpl) {
        const vars = {
          tenant: tenantId,
          ...dto.variables,
        };
        title = tmpl.subject ? this.renderTemplate(tmpl.subject, vars) : title;
        body = this.renderTemplate(tmpl.body, vars);
      }
    }

    const notification = await this.create({
      userId,
      title,
      body,
      type: 'info',
      channel: (dto.channels?.[0] || NotificationChannel.IN_APP).toLowerCase(),
      data: dto.data,
      eventType: dto.eventType,
    });

    const channels = dto.channels?.length ? dto.channels : [NotificationChannel.IN_APP];
    const deliveries: NotificationDeliveryLog[] = [];

    for (const channel of channels) {
      try {
        const log = this.deliveryRepo.create({
          tenantId,
          notificationId: notification.id,
          channel,
          status: DeliveryStatus.PENDING,
          attemptCount: 0,
          metadata: { templateCode: dto.templateCode, variables: dto.variables },
          createdBy: userId,
        });
        const saved = await this.deliveryRepo.save(log);
        deliveries.push(saved);
        await this.attemptDelivery(saved);
      } catch (err: any) {
        this.logger.warn(`Delivery log skipped for channel ${channel}: ${err.message}`);
        // Continue – notification itself was already created
      }
    }

    try {
      await this.audit.logAction(
        'notification',
        notification.id,
        AuditAction.CREATE,
        { newData: { channels, eventType: dto.eventType } },
      );
    } catch (e) {
      this.logger.warn('Audit skipped for notification send');
    }

    this.metricsService.inc('notifications_sent_total');
    return { notification, deliveries };
  }

  private async attemptDelivery(log: NotificationDeliveryLog): Promise<void> {
    log.attemptCount += 1;
    log.lastAttemptAt = new Date();

    try {
      if (log.channel === NotificationChannel.IN_APP) {
        // In-app is always "sent" once the notification row exists
        log.status = DeliveryStatus.SENT;
        log.sentAt = new Date();
      } else {
        // Mock external channels (EMAIL / SMS / WEBHOOK)
        // In production replace with real providers (SendGrid, Twilio, HTTP)
        const success = Math.random() > 0.1; // 90% success for demo
        if (success) {
          log.status = DeliveryStatus.SENT;
          log.sentAt = new Date();
          this.logger.log(`[MOCK] ${log.channel} delivered for notification ${log.notificationId}`);
        } else {
          throw new Error('Mock provider temporary failure');
        }
      }
    } catch (err: any) {
      log.status = DeliveryStatus.FAILED;
      log.errorMessage = err.message;
      this.logger.warn(`Delivery failed (${log.channel}): ${err.message}`);
      this.metricsService.inc('notifications_failed_total');
    }

    await this.deliveryRepo.save(log);
  }

  /**
   * Simple retry for FAILED deliveries (max 3 attempts).
   * Call from a cron job in production.
   */
  async retryFailed(maxAttempts = 3): Promise<{ retried: number }> {
    const tenantId = this.tenantContext.tryGetTenantId();
    const qb = this.deliveryRepo
      .createQueryBuilder('d')
      .where('d.status = :status', { status: DeliveryStatus.FAILED })
      .andWhere('d.attempt_count < :max', { max: maxAttempts });

    if (tenantId) qb.andWhere('d.tenant_id = :tid', { tid: tenantId });

    const failed = await qb.getMany();
    let retried = 0;

    for (const log of failed) {
      await this.attemptDelivery(log);
      if (log.status === DeliveryStatus.SENT) retried++;
    }

    return { retried };
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

  // ──────────────────────────────────────────────
  // Prometheus metrics
  // ──────────────────────────────────────────────


  async getPrometheusText(): Promise<string> {
    return this.metricsService.text();
  }
}
