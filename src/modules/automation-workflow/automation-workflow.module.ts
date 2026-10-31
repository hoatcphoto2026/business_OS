import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationWorkflowDefinition } from './entities/automation-workflow-definition.entity';
import { AutomationWorkflowInstance } from './entities/automation-workflow-instance.entity';
import { AutomationWorkflowExecution } from './entities/automation-workflow-execution.entity';
import { AutomationWorkflowService } from './automation-workflow.service';
import { WorkflowExecutionService } from './workflow-execution.service';
import { AutomationWorkflowController } from './automation-workflow.controller';
import { AutomationWorkflowSubscriber } from './subscribers/automation-workflow.subscriber';
import { ActionRegistry } from './actions/action-registry';
import { SendEmailAction } from './actions/send-email.action';
import { ActivateSubscriptionAction } from './actions/activate-subscription.action';
import { SuspendTenantAction } from './actions/suspend-tenant.action';
import { Subscription } from '../billing/entities/subscription.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { NotificationModule } from '../notification/notification.module';
import { AuditModule } from '../audit/audit.module';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationWorkflowDefinition,
      AutomationWorkflowInstance,
      AutomationWorkflowExecution,
      Subscription,
      Tenant,
    ]),
    NotificationModule,
    AuditModule,
    EventModule,
    TenantModule,
    RbacModule,
  ],
  controllers: [AutomationWorkflowController],
  providers: [
    AutomationWorkflowService,
    WorkflowExecutionService,
    AutomationWorkflowSubscriber,
    ActionRegistry,
    SendEmailAction,
    ActivateSubscriptionAction,
    SuspendTenantAction,
  ],
  exports: [AutomationWorkflowService],
})
export class AutomationWorkflowModule implements OnModuleInit {
  constructor(
    private readonly registry: ActionRegistry,
    private readonly sendEmail: SendEmailAction,
    private readonly activateSub: ActivateSubscriptionAction,
    private readonly suspendTenant: SuspendTenantAction,
  ) {}

  onModuleInit() {
    this.registry.register(this.sendEmail);
    this.registry.register(this.activateSub);
    this.registry.register(this.suspendTenant);
  }
}
