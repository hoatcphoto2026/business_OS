import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { BillingModule } from '../billing/billing.module';
import { BillingInvoice } from '../billing/entities/billing-invoice.entity';
import { PaymentTransaction } from '../billing/entities/payment-transaction.entity';
import { RbacModule } from '../rbac/rbac.module';
import { AdministrationModule } from '../administration/administration.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    BillingModule, // exports BillingService, InvoiceService, UsageService, PaymentService
    RbacModule,
    AdministrationModule, // for StepUpGuard
    TenantModule, // provides TenantGuard + Tenant/TenantUser repositories
    TypeOrmModule.forFeature([
      BillingInvoice,
      PaymentTransaction,
    ]),
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService],
  exports: [CustomerPortalService],
})
export class CustomerPortalModule {}