import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../event/event-bus.service';
import { EventType, DomainEvent } from '../../event/enums/event-type.enum';
import { NotificationService } from '../notification.service';
import { NotificationChannel } from '../entities/notification-delivery-log.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

/**
 * NotificationSubscriber – A2
 * Listens to domain events (including billing) and sends notifications
 * via the enhanced NotificationService (template + multi-channel).
 */
@Injectable()
export class NotificationSubscriber implements OnModuleInit {
  private readonly logger = new Logger(NotificationSubscriber.name);

  constructor(
    private readonly bus: EventBus,
    private readonly notificationService: NotificationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit() {
    const events: EventType[] = [
      // Existing
      EventType.WorkflowSubmitted,
      EventType.WorkflowApproved,
      EventType.WorkflowRejected,
      EventType.SalesCreated,
      EventType.CustomerCreated,
      EventType.SupplierCreated,
      EventType.FeatureEnabled,
      EventType.FeatureDisabled,
      // A2 billing / lifecycle
      EventType.SubscriptionCreated,
      EventType.SubscriptionChanged,
      EventType.SubscriptionCancelled,
      EventType.SubscriptionReactivated,
      EventType.InvoiceIssued,
      EventType.PaymentReceived,
    ];
    for (const et of events) {
      this.bus.subscribe(et, (e) => this.handle(e));
    }
    this.logger.log(`NotificationSubscriber registered for ${events.length} event types`);
  }

  private async handle(event: DomainEvent) {
    try {
      const payloadUser = (event.payload as any)?.userId || (event.payload as any)?.createdBy;
      const userId = payloadUser || this.tenantContext.tryGetUserId();

      if (!userId) {
        this.logger.log(`Skip notification for ${event.eventType} – no user context`);
        return;
      }

      const templateCode = this.mapTemplate(event.eventType);
      const variables: Record<string, string | number> = {
        tenant: event.tenantId || '',
        ...(event.payload as any),
      };

      await this.notificationService.send({
        userId: String(userId),
        templateCode,
        title: this.buildTitle(event),
        body: this.buildBody(event),
        channels: [NotificationChannel.IN_APP],
        variables,
        eventType: event.eventType,
        data: { aggregateType: event.aggregateType, aggregateId: event.aggregateId, ...event.payload },
      });

      this.logger.log(`Notification sent for ${event.eventType} → user ${userId}`);
    } catch (err: any) {
      this.logger.error(`Failed to send notification for ${event.eventType}: ${err.message}`);
    }
  }

  private mapTemplate(eventType: EventType): string | undefined {
    switch (eventType) {
      case EventType.SubscriptionChanged: return 'PLAN_CHANGED';
      case EventType.InvoiceIssued: return 'INVOICE_CREATED';
      case EventType.PaymentReceived: return 'PAYMENT_RECEIVED';
      default: return undefined;
    }
  }

  private buildTitle(event: DomainEvent): string {
    switch (event.eventType) {
      case EventType.SubscriptionChanged: return 'Plan changed';
      case EventType.SubscriptionCancelled: return 'Subscription cancelled';
      case EventType.InvoiceIssued: return 'Invoice created';
      case EventType.PaymentReceived: return 'Payment received';
      case EventType.WorkflowSubmitted: return 'Workflow submitted for approval';
      case EventType.WorkflowApproved: return 'Workflow approved';
      case EventType.WorkflowRejected: return 'Workflow rejected';
      case EventType.SalesCreated: return 'New sales order created';
      case EventType.CustomerCreated: return 'New customer created';
      default: return `Event: ${event.eventType}`;
    }
  }

  private buildBody(event: DomainEvent): string {
    const p = event.payload as any;
    return p?.name || p?.code || p?.invoiceNumber || p?.amount || JSON.stringify(p).slice(0, 200);
  }
}
