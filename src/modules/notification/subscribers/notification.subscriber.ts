import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../event/event-bus.service';
import { EventType, DomainEvent } from '../../event/enums/event-type.enum';
import { NotificationService } from '../notification.service';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

/**
 * NotificationSubscriber – Phase 3
 * Listens to domain events and creates In-App notifications for the current user.
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
      EventType.WorkflowSubmitted,
      EventType.WorkflowApproved,
      EventType.WorkflowRejected,
      EventType.SalesCreated,
      EventType.CustomerCreated,
      EventType.SupplierCreated,
      EventType.FeatureEnabled,
      EventType.FeatureDisabled,
    ];
    for (const et of events) {
      this.bus.subscribe(et, (e) => this.handle(e));
    }
    this.logger.log(`NotificationSubscriber registered for ${events.length} event types`);
  }

  private async handle(event: DomainEvent) {
    try {
      const title = this.buildTitle(event);
      const body = this.buildBody(event);

      // Prefer explicit userId in payload, else current authenticated user
      const payloadUser = (event.payload as any)?.userId || (event.payload as any)?.createdBy;
      const userId = payloadUser || this.tenantContext.tryGetUserId();

      if (!userId) {
        this.logger.log(`Skip notification for ${event.eventType} – no user context`);
        return;
      }

      await this.notificationService.create({
        userId: String(userId),
        title,
        body,
        type: this.mapType(event.eventType),
        channel: 'in_app',
        data: { aggregateType: event.aggregateType, aggregateId: event.aggregateId, ...event.payload },
        eventType: event.eventType,
      });
      this.logger.log(`Notification created for ${event.eventType} → user ${userId}`);
    } catch (err: any) {
      this.logger.error(`Failed to create notification for ${event.eventType}: ${err.message}`);
    }
  }

  private buildTitle(event: DomainEvent): string {
    switch (event.eventType) {
      case EventType.WorkflowSubmitted: return 'Workflow submitted for approval';
      case EventType.WorkflowApproved: return 'Workflow approved';
      case EventType.WorkflowRejected: return 'Workflow rejected';
      case EventType.SalesCreated: return 'New sales order created';
      case EventType.CustomerCreated: return 'New customer created';
      case EventType.SupplierCreated: return 'New supplier created';
      case EventType.FeatureEnabled: return 'Feature enabled';
      case EventType.FeatureDisabled: return 'Feature disabled';
      default: return `Event: ${event.eventType}`;
    }
  }

  private buildBody(event: DomainEvent): string {
    const p = event.payload as any;
    return p?.name || p?.code || p?.orderNumber || JSON.stringify(p).slice(0, 200);
  }

  private mapType(eventType: EventType): string {
    if (String(eventType).includes('Rejected') || String(eventType).includes('Disabled')) return 'warning';
    if (String(eventType).includes('Approved') || String(eventType).includes('Enabled') || String(eventType).includes('Created')) return 'success';
    return 'info';
  }
}
