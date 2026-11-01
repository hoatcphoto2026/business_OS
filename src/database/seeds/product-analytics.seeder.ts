import { DataSource } from 'typeorm';
import { FeatureUsage } from '../../modules/product-analytics/entities/feature-usage.entity';
import {
  FEATURE_CATALOG,
  UsageSource,
} from '../../modules/product-analytics/enums/product-analytics.enum';

/**
 * D4: baseline feature usage rows for ABC so the dashboard is non-empty right
 * after `npm run seed`. Idempotent per tenant/feature/day.
 */
export async function seedProductAnalytics(dataSource: DataSource): Promise<void> {
  const tenants: Array<{ id: string }> = await dataSource.query(
    "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
  );
  if (!tenants.length) {
    console.log('⚠️  Product analytics seeder skipped (ABC tenant not found)');
    return;
  }
  const tenantId = tenants[0].id;
  const day = new Date().toISOString().slice(0, 10);
  const repo = dataSource.getRepository(FeatureUsage);
  let created = 0;

  for (const feature of FEATURE_CATALOG) {
    const dedupeKey = `SEED:${feature.key}:${tenantId}:${day}`;
    const existing = await repo.findOne({ where: { tenantId, dedupeKey } });
    if (existing) continue;
    await repo.save(
      repo.create({
        tenantId,
        featureKey: feature.key,
        quantity: 1,
        userCount: 1,
        source: UsageSource.SEED,
        dedupeKey,
        occurredAt: new Date(),
        metadata: { seeded: true },
      }),
    );
    created += 1;
  }

  console.log(
    `✅ Product analytics seeder completed (new baseline rows: ${created}, features: ${FEATURE_CATALOG.length})`,
  );
}
