import { Injectable, Logger, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventAutomationLog } from './entities/event-automation-log.entity';
import { AutomationStatus } from './enums/automation.enum';
import { EventBus } from '../event/event-bus.service';
import { EventType, DomainEvent } from '../event/enums/event-type.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { NotificationService } from '../notification/notification.service';

const SUPPORTED_EVENTS: EventType[] = [
  EventType.TenantCreated,
  EventType.TenantOffboarded,
  EventType.InvoiceGenerated,
  EventType.InvoicePaid,
  EventType.PaymentFailed,
  EventType.SubscriptionExpired,
  EventType.SubscriptionReactivated,
  EventType.NotificationFailed,
];

@Injectable()
export class EventAutomationService implements OnModuleInit {
  private readonly logger = new Logger(EventAutomationService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(EventAutomationLog)
    private readonly logs: Repository<EventAutomationLog>,
    private readonly eventBus: EventBus,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    for (const type of SUPPORTED_EVENTS) {
      this.eventBus.subscribe(type, (event) => this.handle(event));
    }
    this.logger.log(`Event Automation subscribed to ${SUPPORTED_EVENTS.length} event types`);
  }

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
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

  /**
   * Idempotent handler. Same eventId is processed at most once successfully.
   */
  async handle(event: DomainEvent): Promise<void> {
    const existing = await this.logs.findOne({ where: { eventId: event.eventId } });
    if (existing && existing.status === AutomationStatus.COMPLETED) {
      this.logger.debug(`Event ${event.eventId} already completed – skip (idempotent)`);
      return;
    }

    const log = existing ?? this.logs.create({
      tenantId: event.tenantId,
      eventId: event.eventId,
      eventType: event.eventType,
      status: AutomationStatus.PROCESSING,
      attemptCount: 0,
      payload: event.payload as Record<string, unknown>,
      idempotencyKey: event.eventId,
    });

    log.attemptCount += 1;
    log.status = AutomationStatus.PROCESSING;
    await this.logs.save(log);

    try {
      await this.dispatch(event);
      log.status = AutomationStatus.COMPLETED;
      log.processedAt = new Date();
      log.lastError = null;
      this.inc('event_automation_completed_total');
    } catch (err: any) {
      log.lastError = err.message || String(err);
      if (log.attemptCount >= log.maxRetries) {
        log.status = AutomationStatus.DEAD_LETTER;
        this.inc('event_automation_dead_letter_total');
        this.logger.warn(`Event ${event.eventId} moved to DLQ after ${log.attemptCount} attempts`);
      } else {
        log.status = AutomationStatus.FAILED;
        this.inc('event_automation_failed_total');
      }
    }

    await this.logs.save(log);

    try {
      await this.audit.logAction('event_automation', log.id, AuditAction.CREATE, {
        newData: { eventType: event.eventType, status: log.status },
      });
    } catch {}
  }

  private async dispatch(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case EventType.TenantCreated:
        await this.onTenantCreated(event);
        break;
      case EventType.TenantOffboarded:
        await this.onTenantOffboarded(event);
        break;
      case EventType.InvoiceGenerated:
      case EventType.InvoicePaid:
        await this.onInvoiceEvent(event);
        break;
      case EventType.PaymentFailed:
        await this.onPaymentFailed(event);
        break;
      case EventType.SubscriptionExpired:
      case EventType.SubscriptionReactivated:
        await this.onSubscriptionEvent(event);
        break;
      case EventType.NotificationFailed:
        await this.onNotificationFailed(event);
        break;
      default:
        this.logger.debug(`No automation handler for ${event.eventType}`);
    }
  }

  private async onTenantCreated(event: DomainEvent): Promise<void> {
    this.logger.log(`Automation: TenantCreated ${event.aggregateId}`);
    // Placeholder: welcome notification, default data seed, etc.
  }

  private async onTenantOffboarded(event: DomainEvent): Promise<void> {
    this.logger.log(`Automation: TenantOffboarded ${event.aggregateId}`);
  }

  private async onInvoiceEvent(event: DomainEvent): Promise<void> {
    this.logger.log(`Automation: ${event.eventType} ${event.aggregateId}`);
  }

  private async onPaymentFailed(event: DomainEvent): Promise<void> {
    this.logger.log(`Automation: PaymentFailed ${event.aggregateId}`);
    try {
      await this.notifications.send({
        title: 'Payment failed',
        body: `Payment for ${event.aggregateId} failed`,
        eventType: 'PaymentFailed',
        data: { aggregateId: event.aggregateId },
      });
    } catch {}
  }

  private async onSubscriptionEvent(event: DomainEvent): Promise<void> {
    this.logger.log(`Automation: ${event.eventType} ${event.aggregateId}`);
  }

  private async onNotificationFailed(event: DomainEvent): Promise<void> {
    this.logger.log(`Automation: NotificationFailed ${event.aggregateId}`);
  }

  async list(status?: AutomationStatus): Promise<EventAutomationLog[]> {
    const tenantId = this.getTenantId();
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.logs.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async listFailures(): Promise<EventAutomationLog[]> {
    const tenantId = this.getTenantId();
    return this.logs.find({
      where: [
        { tenantId, status: AutomationStatus.FAILED },
        { tenantId, status: AutomationStatus.DEAD_LETTER },
      ],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /**
   * Replay a failed / dead-letter event.
   * Re-publishes the original event so handlers run again.
   */
  async replay(logId: string): Promise<EventAutomationLog> {
    const tenantId = this.getTenantId();
    const log = await this.logs.findOne({ where: { id: logId, tenantId } });
    if (!log) throw new ForbiddenException('Automation log not found');

    if (log.status !== AutomationStatus.FAILED && log.status !== AutomationStatus.DEAD_LETTER) {
      return log;
    }

    // Reset and re-handle
    log.status = AutomationStatus.PENDING;
    log.attemptCount = 0;
    log.lastError = null;
    await this.logs.save(log);

    const fakeEvent: DomainEvent = {
      eventId: log.eventId,
      eventType: log.eventType as EventType,
      tenantId: log.tenantId,
      companyId: null,
      branchId: null,
      aggregateType: 'replay',
      aggregateId: log.eventId,
      payload: log.payload,
      createdAt: new Date(),
    };

    await this.handle(fakeEvent);
    return this.logs.findOne({ where: { id: logId } }) as Promise<EventAutomationLog>;
  }
}
