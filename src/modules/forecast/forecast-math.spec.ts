import { describe, expect, it } from '@jest/globals';
import { ForecastMethod } from './enums/forecast.enum';
import { computeForecast, HistoricalPoint } from './forecast-math';

function series(values: number[], start = '2026-01-01'): HistoricalPoint[] {
  const date = new Date(`${start}T00:00:00.000Z`);
  return values.map((value, index) => {
    const current = new Date(date);
    current.setUTCDate(current.getUTCDate() + index);
    return { date: current.toISOString().slice(0, 10), value };
  });
}

describe('forecast math', () => {
  it('moving average keeps a flat series flat and respects bounds', () => {
    const result = computeForecast(
      ForecastMethod.MOVING_AVERAGE,
      series(new Array(60).fill(100)),
      30,
      '2026-03-01',
    );
    expect(result.predictedValue).toBe(100);
    expect(result.lowerBound).toBeLessThanOrEqual(100);
    expect(result.upperBound).toBeGreaterThanOrEqual(100);
    expect(result.confidencePct).toBeGreaterThanOrEqual(30);
    expect(result.confidencePct).toBeLessThanOrEqual(95);
  });

  it('trend projection extends a rising series upwards', () => {
    const values = Array.from({ length: 90 }, (_, index) => 100 + index * 10);
    const result = computeForecast(
      ForecastMethod.TREND_PROJECTION,
      series(values),
      30,
      '2026-03-31',
    );
    expect(result.predictedValue).toBeGreaterThan(values[values.length - 1]);
    expect(result.metadata.slope).toBeGreaterThan(0);
    expect(result.upperBound).toBeGreaterThan(result.predictedValue);
  });

  it('seasonal analysis applies weekday factors and stays non-negative', () => {
    const values = Array.from({ length: 90 }, (_, index) =>
      index % 7 === 0 ? 500 : 100,
    );
    const result = computeForecast(
      ForecastMethod.SEASONAL_ANALYSIS,
      series(values),
      90,
      '2026-03-31',
    );
    expect(result.predictedValue).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.metadata.weekdayFactors)).toBe(true);
    expect((result.metadata.weekdayFactors as number[]).length).toBe(7);
  });

  it('samples at most 30 points ending exactly on the horizon', () => {
    const result = computeForecast(
      ForecastMethod.MOVING_AVERAGE,
      series(new Array(60).fill(10)),
      365,
      '2026-03-01',
    );
    expect(result.points.length).toBeLessThanOrEqual(30);
    expect(result.points[result.points.length - 1].date).toBe('2027-03-01');
    expect(result.points[0].date > result.points[1].date).toBe(false);
  });

  it('returns a safe zero forecast for an empty series', () => {
    const result = computeForecast(
      ForecastMethod.TREND_PROJECTION,
      [],
      30,
      '2026-03-01',
    );
    expect(result.predictedValue).toBe(0);
    expect(result.points).toEqual([]);
    expect(result.metadata.insufficientData).toBe(true);
  });

  it('caps confidence for very short histories', () => {
    const result = computeForecast(
      ForecastMethod.TREND_PROJECTION,
      series([10, 12, 14]),
      30,
      '2026-01-03',
    );
    expect(result.confidencePct).toBeLessThanOrEqual(45);
  });
});
