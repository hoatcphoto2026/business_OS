import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { ScopeModule } from '../scope/scope.module';
import { EventModule } from '../event/event.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    TenantModule,
    RbacModule,
    ScopeModule,
    EventModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, TenantGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
