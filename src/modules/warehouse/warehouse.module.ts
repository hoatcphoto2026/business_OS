import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { WarehouseEtlService } from './warehouse-etl.service';
import {
  FactCompliance,
  FactCustomer,
  FactRevenue,
  FactSecurity,
  FactUsage,
  WarehouseSnapshot,
} from './entities/warehouse-facts.entity';
import {
  WarehouseDimDate,
  WarehouseDimDepartment,
  WarehouseDimOrganization,
  WarehouseDimPlan,
  WarehouseDimTenant,
} from './entities/warehouse-dimensions.entity';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/** EPIC D8 – Analytics Warehouse Layer. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WarehouseDimTenant,
      WarehouseDimPlan,
      WarehouseDimOrganization,
      WarehouseDimDepartment,
      WarehouseDimDate,
      FactRevenue,
      FactUsage,
      FactCustomer,
      FactCompliance,
      FactSecurity,
      WarehouseSnapshot,
    ]),
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseEtlService, PlatformOperatorGuard],
  exports: [WarehouseService, WarehouseEtlService],
})
export class WarehouseModule {}
