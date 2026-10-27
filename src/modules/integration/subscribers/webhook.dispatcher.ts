import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventBus } from '../../event/event-bus.service';
import { EventType, DomainEvent } from '../../event/enums/event-type.enum';
import { WebhookService } from '../webhook.service';
import { IntegrationLog } from '../entities/integration-log.entity';
import { assertSafeWebhookUrl } from '../../../common/security/ssrf';

@Injectable()
export class WebhookDispatcher implements OnModuleInit {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(
    private readonly bus: EventBus,
    private readonly webhookService: WebhookService,
    @InjectRepository(IntegrationLog) private readonly logRepo: Repository<IntegrationLog>,
  ) {}

  onModuleInit() {
    const events = [
      EventType.SalesCreated,
      EventType.CustomerCreated,
      EventType.SupplierCreated,
      EventType.WorkflowApproved,
      EventType.InvoiceIssued,
    ];
    for (const et of events) {
      this.bus.subscribe(et, (e) => this.dispatch(e));
    }
    this.logger.log(`WebhookDispatcher registered for ${events.length} events`);
  }

  private async dispatch(event: DomainEvent) {
    try {
      const hooks = await this.webhookService.findByEvent(event.tenantId, event.eventType);
      for (const hook of hooks) {
        try {
          await assertSafeWebhookUrl(hook.url);
        } catch (err: any) {
          this.logger.warn(`Skipped unsafe webhook ${hook.id}: ${err.message}`);
          continue;
        }
        // Mock outbound call (log only)
        const log = this.logRepo.create({
          tenantId: event.tenantId,
          webhookId: hook.id,
          direction: 'outbound',
          event: event.eventType,
          status: 'success',
          payload: { url: hook.url, aggregateId: event.aggregateId, ...event.payload },
          response: { mock: true, delivered: true },
        });
        await this.logRepo.save(log);
        this.logger.log(`Webhook dispatched: ${hook.name} → ${event.eventType}`);
      }
    } catch (err: any) {
      this.logger.error(`Webhook dispatch failed: ${err.message}`);
    }
  }
}
