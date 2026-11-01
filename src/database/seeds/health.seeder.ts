import { DataSource } from 'typeorm';
import { HealthSignal } from '../../modules/customer-health/entities/health-signal.entity';
import { HEALTH_SIGNAL_DEFINITIONS } from '../../modules/customer-health/enums/customer-health.enum';

/**
 * D3: seed the health signal catalog for the operator tenant (ABC).
 * Score weights can be tuned later via the HealthSignal rows.
 */
export async function seedHealthSignals(dataSource: DataSource): Promise<void> {
  const tenants: Array<{ id: string }> = await dataSource.query(
    "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
  );
  if (!tenants.length) {
    console.log('⚠️  Customer health seeder skipped (ABC tenant not found)');
    return;
  }
  const tenantId = tenants[0].id;
  const repo = dataSource.getRepository(HealthSignal);
  let created = 0;

  for (const definition of HEALTH_SIGNAL_DEFINITIONS) {
    const existing = await repo.findOne({
      where: { tenantId, code: definition.code },
    });
    if (existing) {
      if (!existing.enabled) {
        existing.enabled = true;
        await repo.save(existing);
      }
      continue;
    }
    await repo.save(
      repo.create({
        tenantId,
        code: definition.code,
        name: definition.name,
        weight: definition.weight.toFixed(2),
        description: definition.description,
        enabled: true,
      }),
    );
    created += 1;
  }

  console.log(
    `✅ Customer health seeder completed (signals: ${created} new, ${HEALTH_SIGNAL_DEFINITIONS.length} total)`,
  );
}
