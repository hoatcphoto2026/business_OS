import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../event/event-bus.service';
import { EventType, DomainEvent } from '../../event/enums/event-type.enum';
import { AutomationWorkflowService } from '../automation-workflow.service';

@Injectable()
export class AutomationWorkflowSubscriber implements OnModuleInit {
  private readonly logger = new Logger(AutomationWorkflowSubscriber.name);

  constructor(
    private readonly bus: EventBus,
    private readonly workflowService: AutomationWorkflowService,
  ) {}

  onModuleInit() {
    const events: EventType[] = [
      EventType.InvoiceIssued,
      EventType.PaymentReceived,
      EventType.SubscriptionCancelled,
      EventType.SubscriptionCreated,
      EventType.SubscriptionChanged,
      EventType.SalesCreated,
      EventType.CustomerCreated,
    ];

    for (const et of events) {
      this.bus.subscribe(et, (e) => this.handle(e));
    }
    this.logger.log(`AutomationWorkflowSubscriber registered for ${events.length} event types`);
  }

  private async handle(event: DomainEvent) {
    try {
      if (!event.tenantId) {
        this.logger.warn(`Skip automation for ${event.eventType} – no tenantId`);
        return;
      }

      await this.workflowService.triggerFromEvent(
        event.tenantId,
        event.eventType,
        event.aggregateType || null,
        event.aggregateId || null,
        (event.payload as Record<string, unknown>) || {},
      );
    } catch (err: any) {
      this.logger.error(`Automation handler error for ${event.eventType}: ${err.message}`);
    }
  }
}
