import { DataSource } from 'typeorm';
import { ForecastModel } from '../../modules/forecast/entities/forecast-model.entity';
import {
  FORECAST_METRIC_DEFINITIONS,
  FORECAST_METHODS,
  ForecastModelStatus,
} from '../../modules/forecast/enums/forecast.enum';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';

/**
 * D7 – provision the operator's forecast model matrix
 * (5 metrics × 3 methods = 15 models), idempotently.
 */
export async function seedForecastModels(dataSource: DataSource): Promise<void> {
  const tenant = await dataSource
    .getRepository(Tenant)
    .findOne({ where: { code: 'ABC' } });
  if (!tenant) return;

  const repo = dataSource.getRepository(ForecastModel);
  let created = 0;

  for (const definition of FORECAST_METRIC_DEFINITIONS) {
    for (const method of FORECAST_METHODS) {
      const existing = await repo.findOne({
        where: {
          tenantId: tenant.id,
          metric: definition.metric,
          method,
        },
      });
      if (existing) continue;
      await repo.save(
        repo.create({
          tenantId: tenant.id,
          metric: definition.metric,
          method,
          name: `${definition.label} · ${method}`,
          description: definition.description,
          parameters: { window: 7, seasonLength: 7, zScore: 1.96 },
          status: ForecastModelStatus.ACTIVE,
          version: 1,
        }),
      );
      created += 1;
    }
  }

  console.log(
    `✅ Forecast seeder completed (operator tenant ABC, new models: ${created}, total: ${
      FORECAST_METRIC_DEFINITIONS.length * FORECAST_METHODS.length
    })`,
  );
}
