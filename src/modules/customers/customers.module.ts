import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { ScopeModule } from '../scope/scope.module';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, TenantUser]),
    TenantModule,
    RbacModule,
    ScopeModule,
    EventModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, TenantGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
