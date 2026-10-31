import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoNotificationLog } from './entities/auto-notification-log.entity';
import { AutoNotifyEvent, NotifyChannel, DeliveryStatus } from './enums/auto-notify.enum';
import { TriggerAutoNotifyDto } from './dto/trigger-auto-notify.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { NotificationService } from '../notification/notification.service';

const TEMPLATES: Record<AutoNotifyEvent, string> = {
  [AutoNotifyEvent.SUBSCRIPTION_EXPIRING]: 'Your subscription expires on {{date}}.',
  [AutoNotifyEvent.SUBSCRIPTION_EXPIRED]: 'Your subscription has expired.',
  [AutoNotifyEvent.INVOICE_CREATED]: 'Invoice {{invoiceNumber}} for {{amount}} has been created.',
  [AutoNotifyEvent.INVOICE_OVERDUE]: 'Invoice {{invoiceNumber}} is overdue.',
  [AutoNotifyEvent.PAYMENT_SUCCESS]: 'Payment of {{amount}} succeeded.',
  [AutoNotifyEvent.PAYMENT_FAILED]: 'Payment of {{amount}} failed.',
  [AutoNotifyEvent.SUPPORT_TICKET_UPDATED]: 'Ticket #{{ticketId}} has been updated.',
};

@Injectable()
export class AutoNotificationService {
  private readonly logger = new Logger(AutoNotificationService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(AutoNotificationLog)
    private readonly logs: Repository<AutoNotificationLog>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
  }

  private getUserId(): string {
    return this.tenantContext.getCurrentUserId() || '';
  }

  private inc(name: string) {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  getPrometheusText(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters.entries()) {
      lines.push(`# TYPE ${k} counter`);
      lines.push(`${k} ${v}`);
    }
    return lines.join('\n') + '\n';
  }

  private render(template: string, vars: Record<string, string | number> = {}): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
  }

  async trigger(dto: TriggerAutoNotifyDto): Promise<AutoNotificationLog[]> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    const channels = dto.channels?.length ? dto.channels : [NotifyChannel.IN_APP];
    const template = TEMPLATES[dto.event] || 'Notification';
    const body = this.render(template, dto.variables || {});

    const results: AutoNotificationLog[] = [];

    for (const channel of channels) {
      const log = this.logs.create({
        tenantId,
        event: dto.event,
        channel,
        templateCode: dto.event,
        recipient: dto.recipient,
        body,
        status: DeliveryStatus.PENDING,
        metadata: { variables: dto.variables },
        createdBy: userId || null,
      });
      const saved = await this.logs.save(log);

      try {
        await this.deliver(saved);
        saved.status = DeliveryStatus.SENT;
        saved.sentAt = new Date();
        this.inc('auto_notifications_sent_total');
      } catch (err: any) {
        saved.status = DeliveryStatus.FAILED;
        saved.errorMessage = err.message;
        saved.attemptCount += 1;
        this.inc('auto_notifications_failed_total');
        this.logger.warn(`Delivery failed: ${err.message}`);
      }

      await this.logs.save(saved);
      results.push(saved);

      try {
        await this.audit.logAction('auto_notification', saved.id, AuditAction.CREATE, {
          newData: { event: dto.event, channel, status: saved.status },
        });
      } catch {}
    }

    // Also push to in-app notification center
    try {
      await this.notifications.send({
        userId: userId || undefined,
        title: dto.event,
        body,
        eventType: dto.event,
        data: { recipient: dto.recipient },
      });
    } catch {}

    return results;
  }

  private async deliver(log: AutoNotificationLog): Promise<void> {
    // Mock delivery – extend with real providers later
    switch (log.channel) {
      case NotifyChannel.EMAIL:
      case NotifyChannel.SMS:
      case NotifyChannel.WEBHOOK:
      case NotifyChannel.IN_APP:
        this.logger.log(`[${log.channel}] → ${log.recipient}: ${log.body.slice(0, 60)}`);
        break;
    }
  }

  async list(): Promise<AutoNotificationLog[]> {
    const tenantId = this.getTenantId();
    return this.logs.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async retry(id: string): Promise<AutoNotificationLog> {
    const tenantId = this.getTenantId();
    const log = await this.logs.findOne({ where: { id, tenantId } });
    if (!log) throw new ForbiddenException('Log not found');
    if (log.status !== DeliveryStatus.FAILED) return log;

    log.attemptCount += 1;
    log.status = DeliveryStatus.RETRYING;
    await this.logs.save(log);

    try {
      await this.deliver(log);
      log.status = DeliveryStatus.SENT;
      log.sentAt = new Date();
      log.errorMessage = null;
    } catch (err: any) {
      log.status = DeliveryStatus.FAILED;
      log.errorMessage = err.message;
    }

    return this.logs.save(log);
  }
}
