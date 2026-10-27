import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from './entities/sales-order.entity';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';
import { ScopeModule } from '../scope/scope.module';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { WorkflowModule } from '../workflow/workflow.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrder]),
    ScopeModule,
    TenantContextModule,
    TenantModule,
    RbacModule,
    WorkflowModule,
    EventModule,
  ],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, TenantGuard],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
