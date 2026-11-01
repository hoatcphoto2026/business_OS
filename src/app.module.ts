import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { TenantModule } from './modules/tenant/tenant.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { DemoModule } from './modules/demo/demo.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TraceMiddleware } from './common/middleware/trace.middleware';
import { TenantContextModule } from './common/tenant-context/tenant-context.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { TenantAuditInterceptor } from './common/filters/tenant-global.filter';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { Tenant } from './modules/tenant/entities/tenant.entity';
import { TenantUser } from './modules/tenant/entities/tenant-user.entity';
import { User } from './modules/users/entities/user.entity';
import { Customer } from './modules/customers/entities/customer.entity';
import { Company } from './modules/organization/entities/company.entity';
import { Branch } from './modules/organization/entities/branch.entity';
import { Department } from './modules/organization/entities/department.entity';
import { EnterpriseOrganization } from './modules/organization/entities/enterprise-organization.entity';
import { EnterpriseDepartment } from './modules/organization/entities/enterprise-department.entity';
import { EnterpriseTeam } from './modules/organization/entities/enterprise-team.entity';
import { CostCenter } from './modules/organization/entities/cost-center.entity';
import { OrgMembership } from './modules/organization/entities/org-membership.entity';
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
import { SupportTicket } from './modules/support/entities/support-ticket.entity';
import { TicketComment } from './modules/support/entities/ticket-comment.entity';
import { TicketAttachment } from './modules/support/entities/ticket-attachment.entity';
import { TenantOnboarding } from './modules/onboarding/entities/tenant-onboarding.entity';
import { TenantOffboarding } from './modules/offboarding/entities/tenant-offboarding.entity';
import { ScheduledJob } from './modules/scheduled-jobs/entities/scheduled-job.entity';
import { JobExecutionHistory } from './modules/scheduled-jobs/entities/job-execution-history.entity';
import { RuleDefinition } from './modules/rule-engine/entities/rule-definition.entity';
import { RuleCondition } from './modules/rule-engine/entities/rule-condition.entity';
import { RuleAction } from './modules/rule-engine/entities/rule-action.entity';
import { RuleExecution } from './modules/rule-engine/entities/rule-execution.entity';
import { EventAutomationLog } from './modules/event-automation/entities/event-automation-log.entity';
import { RenewalAttempt } from './modules/auto-renewal/entities/renewal-attempt.entity';
import { SuspensionRecord } from './modules/auto-suspension/entities/suspension-record.entity';
import { AutoInvoice } from './modules/auto-invoice/entities/auto-invoice.entity';
import { AutoInvoiceItem } from './modules/auto-invoice/entities/auto-invoice-item.entity';
import { AutoNotificationLog } from './modules/auto-notification/entities/auto-notification-log.entity';
import { AutomationWorkflowDefinition } from './modules/automation-workflow/entities/automation-workflow-definition.entity';
import { AutomationWorkflowInstance } from './modules/automation-workflow/entities/automation-workflow-instance.entity';
import { AutomationWorkflowExecution } from './modules/automation-workflow/entities/automation-workflow-execution.entity';
import { AutomationWorkflowModule } from './modules/automation-workflow/automation-workflow.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ScimModule } from './modules/scim/scim.module';
import { ScimEndpoint } from './modules/scim/entities/scim-endpoint.entity';
import { ScimMapping } from './modules/scim/entities/scim-mapping.entity';
import { ScimProvisioningLog } from './modules/scim/entities/scim-provisioning-log.entity';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { EvidenceRecord } from './modules/compliance/entities/evidence-record.entity';
import { AccessReview } from './modules/compliance/entities/access-review.entity';
import { RiskAssessment } from './modules/compliance/entities/risk-assessment.entity';
import { ComplianceSnapshot } from './modules/compliance/entities/compliance-snapshot.entity';
import { SecurityModule } from './modules/security/security.module';
import { SecurityEvent } from './modules/security/entities/security-event.entity';
import { LoginAttempt } from './modules/security/entities/login-attempt.entity';
import { LoginLocation } from './modules/security/entities/login-location.entity';
import { AlertRule } from './modules/security/entities/alert-rule.entity';
import { SecretRotation } from './modules/security/entities/secret-rotation.entity';
import { EmergencyAccess } from './modules/security/entities/emergency-access.entity';
import { ReportingModule } from './modules/reporting/reporting.module';
import { ReportRun } from './modules/reporting/entities/report-run.entity';
import { ReportSchedule } from './modules/reporting/entities/report-schedule.entity';
import { ReportDelivery } from './modules/reporting/entities/report-delivery.entity';
import { IdentityProvider } from './modules/identity/entities/identity-provider.entity';
import { IdentityMapping } from './modules/identity/entities/identity-mapping.entity';
import { SSOSession } from './modules/identity/entities/sso-session.entity';
import { StepUpSession } from './modules/administration/entities/step-up-session.entity';
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
import { AuditEvent } from './modules/audit/entities/audit-event.entity';
import { AuditExport } from './modules/audit/entities/audit-export.entity';
import { AuditRetentionPolicy } from './modules/audit/entities/audit-retention-policy.entity';
import { ComplianceReport } from './modules/audit/entities/compliance-report.entity';
import { AuditInterceptor } from './modules/audit/interceptors/audit.interceptor';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { WorkflowInstance } from './modules/workflow/entities/workflow-instance.entity';
import { WorkflowHistory } from './modules/workflow/entities/workflow-history.entity';
import { WorkflowDefinition } from './modules/workflow/entities/workflow-definition.entity';
import { WorkflowNode } from './modules/workflow/entities/workflow-node.entity';
import { WorkflowTransition } from './modules/workflow/entities/workflow-transition.entity';
import { WorkflowExecution } from './modules/workflow/entities/workflow-execution.entity';
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
import { AutoNotificationModule } from './modules/auto-notification/auto-notification.module';
import { AutoInvoiceModule } from './modules/auto-invoice/auto-invoice.module';
import { Feature } from './modules/feature/entities/feature.entity';
import { AutoSuspensionModule } from './modules/auto-suspension/auto-suspension.module';
import { AutoRenewalModule } from './modules/auto-renewal/auto-renewal.module';
import { EventAutomationModule } from './modules/event-automation/event-automation.module';
import { RuleEngineModule } from './modules/rule-engine/rule-engine.module';
import { TenantFeature } from './modules/feature/entities/tenant-feature.entity';
import { AdministrationModule } from './modules/administration/administration.module';
import { BillingModule } from './modules/billing/billing.module';
import { ScheduledJobsModule } from './modules/scheduled-jobs/scheduled-jobs.module';
import { CustomerPortalModule } from './modules/customer-portal/customer-portal.module';
import { OffboardingModule } from './modules/offboarding/offboarding.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { SupportModule } from './modules/support/support.module';
import { TenantSetting } from './modules/administration/entities/tenant-setting.entity';
import { LoginHistory } from './modules/administration/entities/login-history.entity';
import { CopilotSetting } from './modules/administration/entities/copilot-setting.entity';
import { Plan } from './modules/billing/entities/plan.entity';
import { PlanFeature } from './modules/billing/entities/plan-feature.entity';
import { Subscription } from './modules/billing/entities/subscription.entity';
import { UsageRecord } from './modules/billing/entities/usage-record.entity';
import { UsageDaily } from './modules/billing/entities/usage-daily.entity';
import { UsageMonthly } from './modules/billing/entities/usage-monthly.entity';
import { BillingInvoice } from './modules/billing/entities/billing-invoice.entity';
import { BillingInvoiceItem } from './modules/billing/entities/billing-invoice-item.entity';
import { Coupon } from './modules/billing/entities/coupon.entity';
import { PaymentMethod } from './modules/billing/entities/payment-method.entity';
import { PaymentTransaction } from './modules/billing/entities/payment-transaction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit (per IP). Values come from .env via ConfigService.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL_MS', 60000)),
          limit: Number(config.get('THROTTLE_LIMIT', 300)),
        },
      ],
    }),
    ScheduleModule.forRoot(),
    TenantContextModule,
    MetricsModule,
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
        autoLoadEntities: true,
        entities: [
          Tenant,
          TenantUser,
          User,
          Customer,
          Company,
          Branch,
          Department,
          EnterpriseOrganization,
          EnterpriseDepartment,
          EnterpriseTeam,
          CostCenter,
          OrgMembership,
          IdentityProvider,
          IdentityMapping,
          SSOSession,
          ScimEndpoint,
          ScimMapping,
          ScimProvisioningLog,
          EvidenceRecord,
          AccessReview,
          RiskAssessment,
          ComplianceSnapshot,
          SecurityEvent,
          LoginAttempt,
          LoginLocation,
          AlertRule,
          SecretRotation,
          EmergencyAccess,
          ReportRun,
          ReportSchedule,
          ReportDelivery,
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
          AuditEvent,
          AuditExport,
          AuditRetentionPolicy,
          ComplianceReport,
          WorkflowInstance,
          WorkflowHistory,
          WorkflowDefinition,
          WorkflowNode,
          WorkflowTransition,
          WorkflowExecution,
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
          SupportTicket,
          TicketComment,
          TicketAttachment,
          TenantOnboarding,
          TenantOffboarding,
          ScheduledJob,
          JobExecutionHistory,
          RuleDefinition,
          RuleCondition,
          RuleAction,
          RuleExecution,
          EventAutomationLog,
          RenewalAttempt,
          SuspensionRecord,
          AutoInvoice,
          AutoInvoiceItem,
          AutoNotificationLog,
          AutomationWorkflowDefinition,
          AutomationWorkflowInstance,
          AutomationWorkflowExecution,
          StepUpSession,
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
          Plan,
          PlanFeature,
          Subscription,
          UsageRecord,
          UsageDaily,
          UsageMonthly,
          BillingInvoice,
          BillingInvoiceItem,
          Coupon,
          PaymentMethod,
          PaymentTransaction,
        ],
        synchronize: false,
        logging: config.get('DB_LOGGING', 'false') === 'true',
      }),
    }),
    TenantModule,
    HealthModule,
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
    BillingModule,
    CustomerPortalModule,
    SupportModule,
    OnboardingModule,
    OffboardingModule,
    ScheduledJobsModule,
    RuleEngineModule,
    EventAutomationModule,
    AutoRenewalModule,
    AutoSuspensionModule,
    AutoInvoiceModule,
    AutoNotificationModule,
    AutomationWorkflowModule,
    IdentityModule,
    ScimModule,
    ComplianceModule,
    SecurityModule,
    ReportingModule,
    ...(process.env.NODE_ENV !== 'production' ? [DemoModule] : []),
  ],
  providers: [
    // Global HTTP rate limit (per client IP, in-memory). Override via env.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
