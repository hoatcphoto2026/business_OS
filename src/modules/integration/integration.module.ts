import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationController } from './integration.controller';
import { ApiKeyService } from './api-key.service';
import { WebhookService } from './webhook.service';
import { ConnectorService } from './connector.service';
import { WebhookDispatcher } from './subscribers/webhook.dispatcher';
import { ApiKey } from './entities/api-key.entity';
import { Webhook } from './entities/webhook.entity';
import { Connector } from './entities/connector.entity';
import { IntegrationLog } from './entities/integration-log.entity';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, Webhook, Connector, IntegrationLog]),
    EventModule,
    TenantModule,
    RbacModule,
  ],
  controllers: [IntegrationController],
  providers: [ApiKeyService, WebhookService, ConnectorService, WebhookDispatcher, TenantGuard],
  exports: [ApiKeyService, WebhookService, ConnectorService],
})
export class IntegrationModule {}
