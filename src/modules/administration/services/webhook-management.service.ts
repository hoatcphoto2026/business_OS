import { Injectable } from '@nestjs/common';
import { WebhookService } from '../../integration/webhook.service';
import { AuditService } from '../../audit/audit.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';
import { AuditAction } from '../../audit/enums/audit-action.enum';

@Injectable()
export class WebhookManagementService {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async list() {
    return this.webhookService.list();
  }

  async create(data: { name: string; url: string; events: string[] }) {
    const result = await this.webhookService.create(data);
    await this.auditService.logCreate('webhook', result);
    await this.eventBus.publish(EventType.WebhookCreated, 'webhook', result.id, { name: data.name });
    return result;
  }

  async update(id: string, data: any) {
    const result = await this.webhookService.update(id, data);
    await this.auditService.logUpdate('webhook', { id }, result);
    return result;
  }

  async remove(id: string) {
    const result = await this.webhookService.remove(id);
    await this.auditService.logAction('webhook', id, AuditAction.DELETE, { newData: { deleted: true } });
    return result;
  }
}
