import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ForecastMetric } from './enums/forecast.enum';
import { HistoricalPoint } from './forecast-math';

interface SeriesRow {
  day: string | Date;
  value: string | number;
}

function toDate(value: string | Date): string {
  if (value instanceof Date) {
    // node-postgres parses `date` as local midnight; format in local time so
    // the day never shifts by one across timezones.
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Platform-wide daily series for the forecast engine.
 *
 * Every metric aggregates **all tenants** (operator-only feature) into one
 * daily value; missing days are filled with 0 so the math always sees a
 * contiguous timeline of exactly `lookbackDays` points.
 */
@Injectable()
export class ForecastDataService {
  constructor(private readonly dataSource: DataSource) {}

  private sourceSql(metric: ForecastMetric): string {
    const from = '(SELECT from_day FROM bounds)';
    const toExclusive = '((SELECT to_day FROM bounds) + interval \'1 day\')';
    switch (metric) {
      case ForecastMetric.REVENUE:
        return `SELECT date_trunc('day', paid_at)::date AS day,
                       SUM(amount_paid) AS value
                  FROM billing_invoices
                 WHERE paid_at >= ${from}
                   AND paid_at < ${toExclusive}
                 GROUP BY 1`;
      case ForecastMetric.CUSTOMER_GROWTH:
        return `SELECT created_at::date AS day, COUNT(*) AS value
                  FROM tenants
                 WHERE created_at >= ${from}
                   AND created_at < ${toExclusive}
                 GROUP BY 1`;
      case ForecastMetric.CHURN:
        return `SELECT cancelled_at::date AS day, COUNT(*) AS value
                  FROM subscriptions
                 WHERE cancelled_at >= ${from}
                   AND cancelled_at < ${toExclusive}
                 GROUP BY 1`;
      case ForecastMetric.USAGE:
        return `SELECT recorded_at::date AS day, SUM(quantity) AS value
                  FROM usage_records
                 WHERE recorded_at >= ${from}
                   AND recorded_at < ${toExclusive}
                 GROUP BY 1`;
      case ForecastMetric.TICKET_VOLUME:
        return `SELECT created_at::date AS day, COUNT(*) AS value
                  FROM support_tickets
                 WHERE created_at >= ${from}
                   AND created_at < ${toExclusive}
                 GROUP BY 1`;
      default:
        throw new Error(`Unsupported forecast metric: ${metric}`);
    }
  }

  /**
   * The window is anchored to the **database** clock (`CURRENT_DATE`) so the
   * last point always equals the DB's today, regardless of Node's timezone.
   */
  async loadSeries(
    metric: ForecastMetric,
    lookbackDays: number,
  ): Promise<HistoricalPoint[]> {
    const rows: SeriesRow[] = await this.dataSource.query(
      `WITH bounds AS (
         SELECT (CURRENT_DATE - ($1::int - 1)) AS from_day, CURRENT_DATE AS to_day
       ),
       days AS (
         SELECT generate_series(from_day, to_day, interval '1 day')::date AS day
           FROM bounds
       ),
       src AS (${this.sourceSql(metric)})
       SELECT days.day,
              COALESCE(src.value, 0)::float8 AS value
         FROM days
         LEFT JOIN src ON src.day = days.day
        ORDER BY days.day`,
      [lookbackDays],
    );

    return rows.map((row) => ({
      date: toDate(row.day),
      value: Number(row.value) || 0,
    }));
  }
}
