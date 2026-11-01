import { DataSource } from 'typeorm';
import { ExecutiveMetric } from '../../modules/executive/entities/executive-metric.entity';
import {
  EXECUTIVE_METRIC_DEFINITIONS,
  SnapshotPeriod,
} from '../../modules/executive/enums/executive.enum';

/**
 * D1: seed the KPI catalog for the operator tenant (ABC).
 * Values stay 0 until the first daily snapshot is generated.
 */
export async function seedExecutiveMetrics(dataSource: DataSource): Promise<void> {
  const tenants: Array<{ id: string }> = await dataSource.query(
    "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
  );
  if (!tenants.length) {
    console.log('⚠️  Executive seeder skipped (ABC tenant not found)');
    return;
  }
  const tenantId = tenants[0].id;
  const repo = dataSource.getRepository(ExecutiveMetric);
  let created = 0;

  for (const definition of EXECUTIVE_METRIC_DEFINITIONS) {
    const existing = await repo.findOne({
      where: { tenantId, code: definition.code },
    });
    if (existing) continue;
    await repo.save(
      repo.create({
        tenantId,
        code: definition.code,
        name: definition.name,
        unit: definition.unit,
        currentValue: '0',
        changePct: '0',
        periodType: SnapshotPeriod.DAILY,
        metadata: { seeded: true },
      }),
    );
    created += 1;
  }

  console.log(
    `✅ Executive seeder completed (operator tenant ABC, new metrics: ${created})`,
  );
}
