import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { DemoModule } from './modules/demo/demo.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TraceMiddleware } from './common/middleware/trace.middleware';
import { TenantContextModule } from './common/tenant-context/tenant-context.module';
import { TenantAuditInterceptor } from './common/filters/tenant-global.filter';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { Tenant } from './modules/tenant/entities/tenant.entity';
import { TenantUser } from './modules/tenant/entities/tenant-user.entity';
import { User } from './modules/users/entities/user.entity';
import { Customer } from './modules/customers/entities/customer.entity';
import { Company } from './modules/organization/entities/company.entity';
import { Branch } from './modules/organization/entities/branch.entity';
import { Department } from './modules/organization/entities/department.entity';
import { UserCompany } from './modules/organization/entities/user-company.entity';
import { UserBranch } from './modules/organization/entities/user-branch.entity';
import { UserDepartment } from './modules/organization/entities/user-department.entity';
import { Product } from './modules/products/entities/product.entity';
import { Supplier } from './modules/master-data/entities/supplier.entity';
import { Warehouse } from './modules/master-data/entities/warehouse.entity';
import { BankAccount } from './modules/master-data/entities/bank-account.entity';
import { Tax } from './modules/master-data/entities/tax.entity';
import { PaymentTerm } from './modules/master-data/entities/payment-term.entity';
import { Currency } from './modules/master-data/entities/currency.entity';
import { UnitOfMeasure } from './modules/master-data/entities/unit-of-measure.entity';
import { Notification } from './modules/notification/entities/notification.entity';
import { NotificationTemplate } from './modules/notification/entities/notification-template.entity';
import { Carrier } from './modules/logistics/entities/carrier.entity';
import { DeliveryOrder } from './modules/logistics/entities/delivery-order.entity';
import { DeliveryTrackingEvent } from './modules/logistics/entities/delivery-tracking-event.entity';
import { CodSettlement } from './modules/logistics/entities/cod-settlement.entity';
import { ApiKey } from './modules/integration/entities/api-key.entity';
import { Webhook } from './modules/integration/entities/webhook.entity';
import { Connector } from './modules/integration/entities/connector.entity';
import { IntegrationLog } from './modules/integration/entities/integration-log.entity';
import { SalesOrder } from './modules/sales-orders/entities/sales-order.entity';
import { Invoice } from './common/entities/invoice.entity';
import { Payment } from './common/entities/payment.entity';
import { InventoryTransaction } from './common/entities/inventory-transaction.entity';
import { Permission } from './modules/rbac/entities/permission.entity';
import { Role } from './modules/rbac/entities/role.entity';
import { RolePermission } from './modules/rbac/entities/role-permission.entity';
import { UserRole } from './modules/rbac/entities/user-role.entity';
import { RoleScope } from './modules/scope/entities/role-scope.entity';
import { Team } from './modules/team/entities/team.entity';
import { TeamMember } from './modules/team/entities/team-member.entity';
import { ScopeModule } from './modules/scope/scope.module';
import { SalesOrdersModule } from './modules/sales-orders/sales-orders.module';
import { ProductsModule } from './modules/products/products.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { AuditInterceptor } from './modules/audit/interceptors/audit.interceptor';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { WorkflowInstance } from './modules/workflow/entities/workflow-instance.entity';
import { WorkflowHistory } from './modules/workflow/entities/workflow-history.entity';
import { EventModule } from './modules/event/event.module';
import { EventLog } from './modules/event/entities/event-log.entity';
import { FeatureModule } from './modules/feature/feature.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { BusinessCopilotModule } from './modules/business-copilot/business-copilot.module';
import { CopilotLog } from './modules/business-copilot/entities/copilot-log.entity';
import { Feature } from './modules/feature/entities/feature.entity';
import { TenantFeature } from './modules/feature/entities/tenant-feature.entity';
import { AdministrationModule } from './modules/administration/administration.module';
import { TenantSetting } from './modules/administration/entities/tenant-setting.entity';
import { LoginHistory } from './modules/administration/entities/login-history.entity';
import { CopilotSetting } from './modules/administration/entities/copilot-setting.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TenantContextModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'business_os'),
        entities: [
          Tenant,
          TenantUser,
          User,
          Customer,
          Company,
          Branch,
          Department,
          UserCompany,
          UserBranch,
          UserDepartment,
          Product,
          SalesOrder,
          Invoice,
          Payment,
          InventoryTransaction,
          Permission,
          Role,
          RolePermission,
          UserRole,
          RoleScope,
          Team,
          TeamMember,
          AuditLog,
          WorkflowInstance,
          WorkflowHistory,
          EventLog,
          Feature,
          TenantFeature,
          CopilotLog,
          Supplier,
          Warehouse,
          BankAccount,
          Tax,
          PaymentTerm,
          Currency,
          UnitOfMeasure,
          Notification,
          NotificationTemplate,
          Carrier,
          DeliveryOrder,
          DeliveryTrackingEvent,
          CodSettlement,
          ApiKey,
          Webhook,
          Connector,
          IntegrationLog,
          TenantSetting,
          LoginHistory,
          CopilotSetting,
        ],
        synchronize: false,
        logging: config.get('DB_LOGGING', 'false') === 'true',
      }),
    }),
    TenantModule,
    AuthModule,
    CustomersModule,
    OrganizationModule,
    RbacModule,
    ScopeModule,
    SalesOrdersModule,
    ProductsModule,
    AuditModule,
    WorkflowModule,
    EventModule,
    FeatureModule,
    MasterDataModule,
    NotificationModule,
    AnalyticsModule,
    IntegrationModule,
    LogisticsModule,
    BusinessCopilotModule,
    AdministrationModule,
    DemoModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantAuditInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
