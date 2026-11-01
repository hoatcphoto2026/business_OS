import { DataSource } from 'typeorm';
import { GrowthSnapshot } from '../../modules/growth/entities/growth-snapshot.entity';
import { GrowthSegment } from '../../modules/growth/entities/growth-segment.entity';
import {
  GrowthSegmentDimension,
  GrowthSnapshotPeriod,
} from '../../modules/growth/enums/growth.enum';
import { GrowthDataService } from '../../modules/growth/growth-data.service';

/**
 * D5: baseline monthly growth snapshot + source/plan segments for ABC.
 * Uses the same computation as the API so seeded values match runtime.
 */
export async function seedGrowthSnapshot(dataSource: DataSource): Promise<void> {
  const tenants: Array<{ id: string }> = await dataSource.query(
    "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
  );
  if (!tenants.length) {
    console.log('⚠️  Growth seeder skipped (ABC tenant not found)');
    return;
  }
  const tenantId = tenants[0].id;
  const now = new Date();
  const snapshotDate = `${now.toISOString().slice(0, 7)}-01`;
  const periodKey = snapshotDate.slice(0, 7);

  const snapshotRepo = dataSource.getRepository(GrowthSnapshot);
  const existing = await snapshotRepo.findOne({
    where: {
      tenantId,
      snapshotDate,
      periodType: GrowthSnapshotPeriod.MONTHLY,
    },
  });
  if (existing) {
    console.log('✅ Growth seeder: current month snapshot already present');
    return;
  }

  const data = new GrowthDataService(dataSource);
  const computed = await data.compute(30);

  await snapshotRepo.save(
    snapshotRepo.create({
      tenantId,
      snapshotDate,
      periodType: GrowthSnapshotPeriod.MONTHLY,
      trialConversionPct: computed.metrics.trialConversionPct.toFixed(2),
      paidConversionPct: computed.metrics.paidConversionPct.toFixed(2),
      expansionRatePct: computed.metrics.expansionRatePct.toFixed(2),
      upsellRatePct: computed.metrics.upsellRatePct.toFixed(2),
      activationRatePct: computed.metrics.activationRatePct.toFixed(2),
      onboardingSuccessPct: computed.metrics.onboardingSuccessPct.toFixed(2),
      tenants: computed.totals.tenants,
      trials: computed.totals.trials,
      paidTenants: computed.totals.paidTenants,
      activatedTenants: computed.totals.activatedTenants,
      upgrades: computed.totals.upgrades,
      downgrades: computed.totals.downgrades,
      mrr: computed.totals.mrr.toFixed(2),
      funnel: computed.funnel as unknown as Record<string, unknown>,
      bySource: computed.bySource as unknown as Array<Record<string, unknown>>,
      byPlan: computed.byPlan as unknown as Array<Record<string, unknown>>,
      generatedAt: now,
    }),
  );

  const segmentRepo = dataSource.getRepository(GrowthSegment);
  const groups: Array<{
    dimension: GrowthSegmentDimension;
    rows: typeof computed.bySource;
  }> = [
    { dimension: GrowthSegmentDimension.SOURCE, rows: computed.bySource },
    { dimension: GrowthSegmentDimension.PLAN, rows: computed.byPlan },
  ];
  let segmentCount = 0;
  for (const group of groups) {
    for (const row of group.rows) {
      await segmentRepo.save(
        segmentRepo.create({
          tenantId,
          dimension: group.dimension,
          segmentKey: row.key,
          label: row.label,
          period: periodKey,
          tenants: row.tenants,
          trials: row.trials,
          paidTenants: row.paidTenants,
          conversions: row.paidTenants,
          mrr: row.mrr.toFixed(2),
          sharePct: row.sharePct.toFixed(2),
          metadata: {},
        }),
      );
      segmentCount += 1;
    }
  }

  console.log(
    `✅ Growth seeder completed (tenants: ${computed.totals.tenants}, segments: ${segmentCount})`,
  );
}
