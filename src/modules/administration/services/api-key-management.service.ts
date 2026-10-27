import { Injectable } from '@nestjs/common';
import { ApiKeyService } from '../../integration/api-key.service';
import { AuditService } from '../../audit/audit.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class ApiKeyManagementService {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async list() {
    return this.apiKeyService.list();
  }

  async create(name: string, expiresAt?: Date) {
    const result = await this.apiKeyService.create(name, expiresAt);
    await this.auditService.logCreate('api_key', result);
    await this.eventBus.publish(EventType.ApiKeyCreated, 'api_key', result.id, { name });
    return result;
  }

  async revoke(id: string) {
    const result = await this.apiKeyService.revoke(id);
    await this.auditService.logUpdate('api_key', { id, status: 'active' }, result);
    return result;
  }
}
