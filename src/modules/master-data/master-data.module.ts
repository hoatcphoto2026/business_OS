import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterDataController } from './master-data.controller';
import { SupplierService } from './services/supplier.service';
import { WarehouseService } from './services/warehouse.service';
import { BankAccountService } from './services/bank-account.service';
import { TaxService } from './services/tax.service';
import { PaymentTermService } from './services/payment-term.service';
import { CurrencyService } from './services/currency.service';
import { UnitOfMeasureService } from './services/unit-of-measure.service';
import { Supplier } from './entities/supplier.entity';
import { Warehouse } from './entities/warehouse.entity';
import { BankAccount } from './entities/bank-account.entity';
import { Tax } from './entities/tax.entity';
import { PaymentTerm } from './entities/payment-term.entity';
import { Currency } from './entities/currency.entity';
import { UnitOfMeasure } from './entities/unit-of-measure.entity';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { ScopeModule } from '../scope/scope.module';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier, Warehouse, BankAccount, Tax, PaymentTerm, Currency, UnitOfMeasure,
    ]),
    CustomersModule,
    TenantModule,
    RbacModule,
    ProductsModule,
    ScopeModule,
    EventModule,
  ],
  controllers: [MasterDataController],
  providers: [
    TenantGuard,
    SupplierService, WarehouseService, BankAccountService,
    TaxService, PaymentTermService, CurrencyService, UnitOfMeasureService,
  ],
  exports: [
    SupplierService, WarehouseService, BankAccountService,
    TaxService, PaymentTermService, CurrencyService, UnitOfMeasureService,
  ],
})
export class MasterDataModule {}
