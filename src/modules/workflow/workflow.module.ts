import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowInstance } from './entities/workflow-instance.entity';
import { WorkflowHistory } from './entities/workflow-history.entity';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowNode } from './entities/workflow-node.entity';
import { WorkflowTransition } from './entities/workflow-transition.entity';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowDefinitionService } from './definitions/workflow-definition.service';
import { WorkflowDefinitionController } from './definitions/workflow-definition.controller';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { TenantModule } from '../tenant/tenant.module';
import { EventModule } from '../event/event.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowInstance,
      WorkflowHistory,
      WorkflowDefinition,
      WorkflowNode,
      WorkflowTransition,
      WorkflowExecution,
    ]),
    TenantModule,
    RbacModule,
    AuditModule,
    EventModule,
    NotificationModule,
  ],
  controllers: [WorkflowController, WorkflowDefinitionController],
  providers: [WorkflowEngineService, WorkflowDefinitionService],
  exports: [WorkflowEngineService, WorkflowDefinitionService],
})
export class WorkflowModule {}
