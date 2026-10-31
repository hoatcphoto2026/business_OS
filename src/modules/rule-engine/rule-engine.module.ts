import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuleDefinition } from './entities/rule-definition.entity';
import { RuleCondition } from './entities/rule-condition.entity';
import { RuleAction } from './entities/rule-action.entity';
import { RuleExecution } from './entities/rule-execution.entity';
import { RuleEngineService } from './rule-engine.service';
import { RuleEngineController } from './rule-engine.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { SupportModule } from '../support/support.module';
import { AutoSuspensionModule } from '../auto-suspension/auto-suspension.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RuleDefinition, RuleCondition, RuleAction, RuleExecution]),
    TenantModule,
    RbacModule,
    AuditModule,
    NotificationModule,
    SupportModule,
    AutoSuspensionModule,
  ],
  controllers: [RuleEngineController],
  providers: [RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
