import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SupplierService } from './services/supplier.service';
import { WarehouseService } from './services/warehouse.service';
import { BankAccountService } from './services/bank-account.service';
import { TaxService } from './services/tax.service';
import { PaymentTermService } from './services/payment-term.service';
import { CurrencyService } from './services/currency.service';
import { UnitOfMeasureService } from './services/unit-of-measure.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('master-data')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MasterDataController {
  constructor(
    private readonly customers: CustomersService,
    private readonly products: ProductsService,
    private readonly suppliers: SupplierService,
    private readonly warehouses: WarehouseService,
    private readonly bankAccounts: BankAccountService,
    private readonly taxes: TaxService,
    private readonly paymentTerms: PaymentTermService,
    private readonly currencies: CurrencyService,
    private readonly uoms: UnitOfMeasureService,
  ) {}

  // Customers (enhanced)
  @Get('customers') findCustomers() { return this.customers.findAll(); }
  @Post('customers') createCustomer(@Body() body: any) { return this.customers.create(body); }
  @Put('customers/:id') updateCustomer(@Param('id') id: string, @Body() body: any) { return this.customers.update(id, body); }
  @Delete('customers/:id') deleteCustomer(@Param('id') id: string) { return this.customers.softDelete(id); }

  // Products
  @Get('products') findProducts() { return this.products.findAll(); }
  @Post('products') createProduct(@Body() body: any) { return this.products.create(body); }
  @Put('products/:id') updateProduct(@Param('id') id: string, @Body() body: any) { return this.products.update(id, body); }
  @Delete('products/:id') deleteProduct(@Param('id') id: string) { return this.products.softDelete(id); }

  // Suppliers
  @Get('suppliers') findSuppliers() { return this.suppliers.findAll(); }
  @Post('suppliers') createSupplier(@Body() body: any) { return this.suppliers.create(body); }
  @Put('suppliers/:id') updateSupplier(@Param('id') id: string, @Body() body: any) { return this.suppliers.update(id, body); }
  @Delete('suppliers/:id') deleteSupplier(@Param('id') id: string) { return this.suppliers.softDelete(id); }

  // Warehouses
  @Get('warehouses') findWarehouses() { return this.warehouses.findAll(); }
  @Post('warehouses') createWarehouse(@Body() body: any) { return this.warehouses.create(body); }
  @Put('warehouses/:id') updateWarehouse(@Param('id') id: string, @Body() body: any) { return this.warehouses.update(id, body); }
  @Delete('warehouses/:id') deleteWarehouse(@Param('id') id: string) { return this.warehouses.softDelete(id); }

  // Bank Accounts
  @Get('bank-accounts') findBanks() { return this.bankAccounts.findAll(); }
  @Post('bank-accounts') createBank(@Body() body: any) { return this.bankAccounts.create(body); }
  @Put('bank-accounts/:id') updateBank(@Param('id') id: string, @Body() body: any) { return this.bankAccounts.update(id, body); }
  @Delete('bank-accounts/:id') deleteBank(@Param('id') id: string) { return this.bankAccounts.softDelete(id); }

  // Taxes
  @Get('taxes') findTaxes() { return this.taxes.findAll(); }
  @Post('taxes') createTax(@Body() body: any) { return this.taxes.create(body); }
  @Put('taxes/:id') updateTax(@Param('id') id: string, @Body() body: any) { return this.taxes.update(id, body); }
  @Delete('taxes/:id') deleteTax(@Param('id') id: string) { return this.taxes.softDelete(id); }

  // Payment Terms
  @Get('payment-terms') findTerms() { return this.paymentTerms.findAll(); }
  @Post('payment-terms') createTerm(@Body() body: any) { return this.paymentTerms.create(body); }
  @Put('payment-terms/:id') updateTerm(@Param('id') id: string, @Body() body: any) { return this.paymentTerms.update(id, body); }
  @Delete('payment-terms/:id') deleteTerm(@Param('id') id: string) { return this.paymentTerms.softDelete(id); }

  // Currencies
  @Get('currencies') findCurrencies() { return this.currencies.findAll(); }
  @Post('currencies') createCurrency(@Body() body: any) { return this.currencies.create(body); }
  @Put('currencies/:id') updateCurrency(@Param('id') id: string, @Body() body: any) { return this.currencies.update(id, body); }
  @Delete('currencies/:id') deleteCurrency(@Param('id') id: string) { return this.currencies.softDelete(id); }

  // UOMs
  @Get('uoms') findUoms() { return this.uoms.findAll(); }
  @Post('uoms') createUom(@Body() body: any) { return this.uoms.create(body); }
  @Put('uoms/:id') updateUom(@Param('id') id: string, @Body() body: any) { return this.uoms.update(id, body); }
  @Delete('uoms/:id') deleteUom(@Param('id') id: string) { return this.uoms.softDelete(id); }
}
