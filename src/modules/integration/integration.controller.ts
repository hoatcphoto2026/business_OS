import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { WebhookService } from './webhook.service';
import { ConnectorService } from './connector.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('integration')
@UseGuards(JwtAuthGuard, TenantGuard)
export class IntegrationController {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly webhooks: WebhookService,
    private readonly connectors: ConnectorService,
  ) {}

  // API Keys
  @Get('api-keys') listKeys() { return this.apiKeys.list(); }
  @Post('api-keys') createKey(@Body() body: { name: string; expiresAt?: string }) {
    return this.apiKeys.create(body.name, body.expiresAt ? new Date(body.expiresAt) : undefined);
  }
  @Delete('api-keys/:id') revokeKey(@Param('id') id: string) { return this.apiKeys.revoke(id); }

  // Webhooks
  @Get('webhooks') listHooks() { return this.webhooks.list(); }
  @Post('webhooks') createHook(@Body() body: any) { return this.webhooks.create(body); }
  @Put('webhooks/:id') updateHook(@Param('id') id: string, @Body() body: any) { return this.webhooks.update(id, body); }
  @Delete('webhooks/:id') removeHook(@Param('id') id: string) { return this.webhooks.remove(id); }

  // Connectors
  @Get('connectors') listConnectors() { return this.connectors.list(); }
  @Get('connectors/available') available() { return this.connectors.available(); }
  @Post('connectors') createConnector(@Body() body: any) { return this.connectors.create(body); }
  @Put('connectors/:id') updateConnector(@Param('id') id: string, @Body() body: any) { return this.connectors.update(id, body); }
  @Post('connectors/:id/test') testConnector(@Param('id') id: string) { return this.connectors.test(id); }
}
