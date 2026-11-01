import { DataSource } from 'typeorm';
import { RevenueSnapshot } from '../../modules/revenue/entities/revenue-snapshot.entity';
import { RevenueForecast } from '../../modules/revenue/entities/revenue-forecast.entity';
import { RevenueSegment } from '../../modules/revenue/entities/revenue-segment.entity';
import {
  RevenueDimension,
  RevenueSnapshotPeriod,
} from '../../modules/revenue/enums/revenue.enum';
import { RevenueDataService } from '../../modules/revenue/revenue-data.service';

/**
 * D2: baseline monthly revenue snapshot for the operator tenant (ABC).
 * Computed with the same builder used by the API so seed data matches runtime.
 */
export async function seedRevenueSnapshot(dataSource: DataSource): Promise<void> {
  const tenants: Array<{ id: string }> = await dataSource.query(
    "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
  );
  if (!tenants.length) {
    console.log('⚠️  Revenue seeder skipped (ABC tenant not found)');
    return;
  }
  const tenantId = tenants[0].id;
  const now = new Date();
  const snapshotDate = `${now.toISOString().slice(0, 7)}-01`;
  const periodKey = snapshotDate.slice(0, 7);

  const snapshotRepo = dataSource.getRepository(RevenueSnapshot);
  const existing = await snapshotRepo.findOne({
    where: {
      tenantId,
      snapshotDate,
      periodType: RevenueSnapshotPeriod.MONTHLY,
    },
  });
  if (existing) {
    console.log('✅ Revenue seeder: current month snapshot already present');
    return;
  }

  const data = new RevenueDataService(dataSource);
  const computed = await data.compute(30);
  const forecasts = await data.forecast(tenantId, computed, 30);

  await snapshotRepo.save(
    snapshotRepo.create({
      tenantId,
      snapshotDate,
      periodType: RevenueSnapshotPeriod.MONTHLY,
      mrr: computed.mrr.toFixed(2),
      arr: computed.arr.toFixed(2),
      expansionRevenue: computed.expansionRevenue.toFixed(2),
      contractionRevenue: computed.contractionRevenue.toFixed(2),
      netNewRevenue: computed.netNewRevenue.toFixed(2),
      paidRevenue: computed.paidRevenue.toFixed(2),
      payingCustomers: computed.payingCustomers,
      customerCount: computed.customerCount,
      byPlan: computed.byPlan as unknown as Array<Record<string, unknown>>,
      byTenant: computed.byTenant as unknown as Array<Record<string, unknown>>,
      byCountry: computed.byCountry as unknown as Array<Record<string, unknown>>,
      generatedAt: now,
    }),
  );

  const segmentRepo = dataSource.getRepository(RevenueSegment);
  const groups: Array<{
    dimension: RevenueDimension;
    rows: typeof computed.byPlan;
  }> = [
    { dimension: RevenueDimension.PLAN, rows: computed.byPlan },
    { dimension: RevenueDimension.TENANT, rows: computed.byTenant },
    { dimension: RevenueDimension.COUNTRY, rows: computed.byCountry },
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
          mrr: row.mrr.toFixed(2),
          arr: row.arr.toFixed(2),
          sharePct: row.sharePct.toFixed(2),
          customers: row.customers,
          metadata: row.metadata,
        }),
      );
      segmentCount += 1;
    }
  }

  const forecastRepo = dataSource.getRepository(RevenueForecast);
  const asOf = now.toISOString().slice(0, 10);
  for (const row of forecasts) {
    await forecastRepo.save(
      forecastRepo.create({
        tenantId,
        horizon: row.horizon,
        asOf,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        predictedRevenue: row.predictedRevenue.toFixed(2),
        lowerBound: row.lowerBound.toFixed(2),
        upperBound: row.upperBound.toFixed(2),
        confidence: row.confidence.toFixed(4),
        method: row.method,
        inputs: row.inputs,
        generatedAt: now,
      }),
    );
  }

  console.log(
    `✅ Revenue seeder completed (MRR: ${computed.mrr}, segments: ${segmentCount}, forecasts: ${forecasts.length})`,
  );
}
