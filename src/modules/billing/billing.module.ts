import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlanFeature } from './entities/plan-feature.entity';
import { Subscription } from './entities/subscription.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { LicenseDemoController } from './license-demo.controller';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { Webhook } from '../integration/entities/webhook.entity';
import { AuditModule } from '../audit/audit.module';
import { EventModule } from '../event/event.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdministrationModule } from '../administration/administration.module';
import { LicenseService } from './license.service';
import { LicenseCache } from './cache/license-cache';
import { SubscriptionGuard } from './guards/subscription.guard';
import { FeatureLimitGuard } from './guards/feature-limit.guard';
import { UsageRecord } from './entities/usage-record.entity';
import { UsageDaily } from './entities/usage-daily.entity';
import { UsageMonthly } from './entities/usage-monthly.entity';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { UsageAggregationJob } from './jobs/usage-aggregation.job';
import { BillingInvoice } from './entities/billing-invoice.entity';
import { BillingInvoiceItem } from './entities/billing-invoice-item.entity';
import { Coupon } from './entities/coupon.entity';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { PaymentMethod } from './entities/payment-method.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { MockGateway } from './gateways/mock.gateway';
import { VietQRGateway } from './gateways/vietqr.gateway';
import { PayOSGateway } from './gateways/payos.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plan,
      PlanFeature,
      Subscription,
      Tenant,
      TenantUser,
      ApiKey,
      Webhook,
      UsageRecord,
      UsageDaily,
      UsageMonthly,
      BillingInvoice,
      BillingInvoiceItem,
      Coupon,
      PaymentMethod,
      PaymentTransaction,
    ]),
    AuditModule,
    EventModule,
    RbacModule,
    TenantModule,
    AdministrationModule,
  ],
  controllers: [BillingController, LicenseDemoController, UsageController, InvoiceController, PaymentController],
  providers: [
    BillingService,
    LicenseService,
    LicenseCache,
    SubscriptionGuard,
    FeatureLimitGuard,
    UsageService,
    UsageAggregationJob,
    InvoiceService,
    PaymentService,
    ...(process.env.NODE_ENV !== 'production' ? [MockGateway] : []),
    VietQRGateway,
    PayOSGateway,
  ],
  exports: [
    BillingService,
    LicenseService,
    SubscriptionGuard,
    FeatureLimitGuard,
    UsageService,
    InvoiceService,
    PaymentService,
  ],
})
export class BillingModule {}