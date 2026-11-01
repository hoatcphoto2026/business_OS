export enum FeatureKey {
  SALES_ORDERS = 'SALES_ORDERS',
  INVOICES = 'INVOICES',
  CUSTOMERS = 'CUSTOMERS',
  PRODUCTS = 'PRODUCTS',
  SUPPORT = 'SUPPORT',
  REPORTS = 'REPORTS',
  COMPLIANCE = 'COMPLIANCE',
  SECURITY = 'SECURITY',
  SCIM = 'SCIM',
  API_KEYS = 'API_KEYS',
  AUTOMATION = 'AUTOMATION',
}

export enum AdoptionDimension {
  TENANT = 'TENANT',
  ORGANIZATION = 'ORGANIZATION',
  DEPARTMENT = 'DEPARTMENT',
  PLAN = 'PLAN',
}

export enum UsageSource {
  TRACKED = 'TRACKED',
  DERIVED = 'DERIVED',
  SEED = 'SEED',
}

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
}

export const FEATURE_CATALOG: FeatureDefinition[] = [
  {
    key: FeatureKey.SALES_ORDERS,
    label: 'Sales orders',
    description: 'Orders created / updated in the sales module',
  },
  {
    key: FeatureKey.INVOICES,
    label: 'Invoices',
    description: 'Sales invoices issued',
  },
  {
    key: FeatureKey.CUSTOMERS,
    label: 'Customers',
    description: 'Customer records created',
  },
  {
    key: FeatureKey.PRODUCTS,
    label: 'Products',
    description: 'Product catalog activity',
  },
  {
    key: FeatureKey.SUPPORT,
    label: 'Support tickets',
    description: 'Support tickets opened',
  },
  {
    key: FeatureKey.REPORTS,
    label: 'Reports',
    description: 'Report runs (enterprise reporting)',
  },
  {
    key: FeatureKey.COMPLIANCE,
    label: 'Compliance',
    description: 'Evidence collected in the compliance center',
  },
  {
    key: FeatureKey.SECURITY,
    label: 'Security',
    description: 'Security events processed',
  },
  {
    key: FeatureKey.SCIM,
    label: 'SCIM provisioning',
    description: 'SCIM provisioning operations',
  },
  {
    key: FeatureKey.API_KEYS,
    label: 'API keys',
    description: 'API keys created for integrations',
  },
  {
    key: FeatureKey.AUTOMATION,
    label: 'Automation',
    description: 'Scheduled automation jobs',
  },
];

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_CATALOG.map(
  (feature) => feature.key,
);
