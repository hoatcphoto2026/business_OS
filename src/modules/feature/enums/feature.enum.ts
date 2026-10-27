/**
 * Feature Catalog – Sprint 8
 * Feature ≠ Permission ≠ Scope
 * Feature = module exists / is available for the tenant
 */
export enum FeatureCode {
  SALES = 'sales',
  CRM = 'crm',
  INVENTORY = 'inventory',
  PURCHASE = 'purchase',
  ACCOUNTING = 'accounting',
  TAX = 'tax',
  BANKING = 'banking',
  REPORTING = 'reporting',
  BUSINESS_COPILOT = 'business_copilot',
  BUSINESS_COPILOT_AI = 'business_copilot_ai',
  WORKFLOW = 'workflow',
  AUDIT = 'audit',
}

export enum FeatureStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  HIDDEN = 'hidden',
}

export enum PlanCode {
  STARTER = 'starter',
  GROWTH = 'growth',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
}
