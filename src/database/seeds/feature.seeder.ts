import { DataSource } from 'typeorm';
import { Feature } from '../../modules/feature/entities/feature.entity';
import { TenantFeature } from '../../modules/feature/entities/tenant-feature.entity';
import { FeatureCode, FeatureStatus, PlanCode } from '../../modules/feature/enums/feature.enum';
import { PLAN_FEATURES } from '../../modules/feature/feature.service';

const CATALOG: Array<{
  code: FeatureCode;
  name: string;
  description: string;
  category: string;
}> = [
  { code: FeatureCode.SALES, name: 'Sales', description: 'Sales orders and quotations', category: 'core' },
  { code: FeatureCode.CRM, name: 'CRM', description: 'Customers and contacts', category: 'core' },
  { code: FeatureCode.INVENTORY, name: 'Inventory', description: 'Stock and warehouses', category: 'operations' },
  { code: FeatureCode.PURCHASE, name: 'Purchase', description: 'Purchase orders', category: 'operations' },
  { code: FeatureCode.ACCOUNTING, name: 'Accounting', description: 'General ledger and journals', category: 'finance' },
  { code: FeatureCode.TAX, name: 'Tax', description: 'VAT and tax declarations', category: 'finance' },
  { code: FeatureCode.BANKING, name: 'Banking', description: 'Bank accounts and reconciliation', category: 'finance' },
  { code: FeatureCode.REPORTING, name: 'Reporting', description: 'Financial and operational reports', category: 'insights' },
  { code: FeatureCode.BUSINESS_COPILOT, name: 'Business Copilot', description: 'AI assistant', category: 'ai' },
  { code: FeatureCode.BUSINESS_COPILOT_AI, name: 'Business Copilot AI', description: 'LLM-powered copilot', category: 'ai' },
  { code: FeatureCode.WORKFLOW, name: 'Workflow', description: 'Approval workflows', category: 'governance' },
  { code: FeatureCode.AUDIT, name: 'Audit', description: 'Audit trail', category: 'governance' },
];

export async function seedFeatures(
  dataSource: DataSource,
  options?: { abcPlan?: PlanCode; cafePlan?: PlanCode },
): Promise<void> {
  const featureRepo = dataSource.getRepository(Feature);
  const tfRepo = dataSource.getRepository(TenantFeature);

  // Catalog
  for (const item of CATALOG) {
    let f = await featureRepo.findOne({ where: { code: item.code } });
    if (!f) {
      f = featureRepo.create({
        code: item.code,
        name: item.name,
        description: item.description,
        category: item.category,
        status: FeatureStatus.ACTIVE,
      });
      await featureRepo.save(f);
    }
  }

  const allFeatures = await featureRepo.find();

  async function apply(tenantCode: string, plan: PlanCode) {
    const tenant = await dataSource.getRepository('tenants').findOne({ where: { code: tenantCode } }) as { id: string } | null;
    if (!tenant) return;

    const enabled = new Set(PLAN_FEATURES[plan]);
    for (const f of allFeatures) {
      const should = enabled.has(f.code as FeatureCode);
      let row = await tfRepo.findOne({ where: { tenantId: tenant.id, featureId: f.id } });
      if (!row) {
        row = tfRepo.create({
          tenantId: tenant.id,
          featureId: f.id,
          enabled: should,
          enabledAt: should ? new Date() : null,
        });
      } else {
        row.enabled = should;
        row.enabledAt = should ? row.enabledAt ?? new Date() : null;
      }
      await tfRepo.save(row);
    }
  }

  // ABC = Growth (sales, crm, inventory) — accounting OFF for CASE 1
  await apply('ABC', options?.abcPlan ?? PlanCode.GROWTH);
  // Cafe Mộc = Starter
  await apply('CAFE_MOC', options?.cafePlan ?? PlanCode.STARTER);

  console.log('   Features catalog + tenant plans seeded (ABC=Growth, Cafe=Starter)');
}
