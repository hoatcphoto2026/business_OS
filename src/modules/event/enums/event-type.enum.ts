/**
 * Event Types – Sprint 7 Event Registry + Phase 2 Master Data
 */
export enum EventType {
  // Customer
  CustomerCreated = 'CustomerCreated',
  CustomerUpdated = 'CustomerUpdated',
  CustomerDeleted = 'CustomerDeleted',

  // Product
  ProductCreated = 'ProductCreated',
  ProductUpdated = 'ProductUpdated',
  ProductDeleted = 'ProductDeleted',

  // Master Data Phase 2
  SupplierCreated = 'SupplierCreated',
  SupplierUpdated = 'SupplierUpdated',
  SupplierDeleted = 'SupplierDeleted',
  WarehouseCreated = 'WarehouseCreated',
  WarehouseUpdated = 'WarehouseUpdated',
  BankAccountCreated = 'BankAccountCreated',
  TaxCreated = 'TaxCreated',
  PaymentTermCreated = 'PaymentTermCreated',
  CurrencyCreated = 'CurrencyCreated',
  UomCreated = 'UomCreated',
  MasterDataChanged = 'MasterDataChanged',

  // Sales
  SalesCreated = 'SalesCreated',
  SalesUpdated = 'SalesUpdated',
  SalesCancelled = 'SalesCancelled',

  // Workflow
  WorkflowSubmitted = 'WorkflowSubmitted',
  WorkflowApproved = 'WorkflowApproved',
  WorkflowRejected = 'WorkflowRejected',
  WorkflowPosted = 'WorkflowPosted',
  WorkflowCancelled = 'WorkflowCancelled',
  WorkflowClosed = 'WorkflowClosed',

  // Invoice
  InvoiceIssued = 'InvoiceIssued',
  InvoiceCancelled = 'InvoiceCancelled',

  // Payment
  PaymentReceived = 'PaymentReceived',
  PaymentSent = 'PaymentSent',

  // Feature Toggle (Sprint 8)
  FeatureEnabled = 'FeatureEnabled',
  FeatureDisabled = 'FeatureDisabled',

  // Logistics Phase 6
  DeliveryOrderCreated = 'DeliveryOrderCreated',
  CarrierAssigned = 'CarrierAssigned',
  ShipmentCreated = 'ShipmentCreated',
  ShipmentPickedUp = 'ShipmentPickedUp',
  ShipmentDelivered = 'ShipmentDelivered',
  ShipmentReturned = 'ShipmentReturned',
  CodSettled = 'CodSettled',

  // Administration Center
  UserCreated = 'UserCreated',
  UserUpdated = 'UserUpdated',
  RoleCreated = 'RoleCreated',
  RoleUpdated = 'RoleUpdated',
  TeamCreated = 'TeamCreated',
  ApiKeyCreated = 'ApiKeyCreated',
  WebhookCreated = 'WebhookCreated',
  SettingsUpdated = 'SettingsUpdated',

  // Billing / Subscription (Phase 1)
  SubscriptionCreated = 'SubscriptionCreated',
  SubscriptionChanged = 'SubscriptionChanged',
  SubscriptionCancelled = 'SubscriptionCancelled',
  SubscriptionReactivated = 'SubscriptionReactivated',
  SubscriptionExpired = 'SubscriptionExpired',

  // Event Automation (B4)
  TenantCreated = 'TenantCreated',
  TenantOffboarded = 'TenantOffboarded',
  InvoiceGenerated = 'InvoiceGenerated',
  InvoicePaid = 'InvoicePaid',
  PaymentFailed = 'PaymentFailed',
  NotificationFailed = 'NotificationFailed',
}

export const EVENT_TYPES: readonly EventType[] = Object.values(EventType);

export interface DomainEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  tenantId: string;
  companyId: string | null;
  branchId: string | null;
  eventType: EventType;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  createdAt: Date;
}

export type EventHandler = (event: DomainEvent) => Promise<void> | void;
