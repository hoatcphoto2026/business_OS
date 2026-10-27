import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { IntentResolver } from './intent-resolver';
import { QueryEngine } from './query-engine';
import { InsightEngine } from './insight-engine';
import { RecommendationEngine } from './recommendation-engine';
import { Customer } from '../customers/entities/customer.entity';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { WorkflowInstance } from '../workflow/entities/workflow-instance.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { EventLog } from '../event/entities/event-log.entity';
import { CopilotLog } from './entities/copilot-log.entity';
import { LoginHistory } from '../administration/entities/login-history.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { ScopeModule } from '../scope/scope.module';
import { FeatureModule } from '../feature/feature.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';
import { MockProvider } from './ai/mock.provider';
import { OpenAIProvider } from './ai/openai.provider';
import { AzureOpenAIProvider } from './ai/azure-openai.provider';
import { AIProviderFactory } from './ai/ai-provider.factory';
import { PromptTemplateService } from './ai/prompt-template.service';
import { ContextBuilder } from './ai/context-builder';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      SalesOrder,
      WorkflowInstance,
      AuditLog,
      EventLog,
      CopilotLog,
      LoginHistory,
      TenantUser,
    ]),
    ScopeModule,
    FeatureModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [CopilotController],
  providers: [
    CopilotService,
    IntentResolver,
    QueryEngine,
    InsightEngine,
    RecommendationEngine,
    MockProvider,
    OpenAIProvider,
    AzureOpenAIProvider,
    AIProviderFactory,
    PromptTemplateService,
    ContextBuilder,
  ],
  exports: [CopilotService],
})
export class BusinessCopilotModule {}
