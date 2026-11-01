import { ForecastMethod } from './enums/forecast.enum';

export interface HistoricalPoint {
  date: string;
  value: number;
}

export interface ForecastPoint {
  date: string;
  value: number;
}

export interface ForecastOptions {
  window?: number;
  seasonLength?: number;
  zScore?: number;
}

export interface ForecastComputation {
  predictedValue: number;
  lowerBound: number;
  upperBound: number;
  confidencePct: number;
  points: ForecastPoint[];
  metadata: Record<string, unknown>;
}

const MIN_CONFIDENCE = 30;
const MAX_CONFIDENCE = 95;

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function regression(values: number[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };
  const xs = values.map((_, index) => index);
  const xMean = mean(xs);
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (xs[i] - xMean) * (values[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * xs[i];
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : clamp(1 - ssRes / ssTot, 0, 1);
  return { slope, intercept, r2 };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
}

function weeklyFactors(values: number[]): number[] {
  const overall = mean(values);
  const buckets: number[][] = [[], [], [], [], [], [], []];
  values.forEach((value, index) => {
    buckets[index % 7].push(value);
  });
  return buckets.map((bucket) => {
    if (!bucket.length || overall === 0) return 1;
    return clamp(mean(bucket) / overall, 0.5, 1.5);
  });
}

function forecastDailyValues(
  method: ForecastMethod,
  values: number[],
  horizonDays: number,
  forecastDate: string,
  options: ForecastOptions,
): number[] {
  const window = Math.max(2, options.window ?? 7);

  if (!values.length) return new Array(horizonDays).fill(0);

  if (method === ForecastMethod.MOVING_AVERAGE) {
    const extended = [...values];
    const daily: number[] = [];
    for (let i = 0; i < horizonDays; i += 1) {
      const next = clamp(mean(extended.slice(-window)), 0, Number.MAX_SAFE_INTEGER);
      extended.push(next);
      daily.push(next);
    }
    return daily;
  }

  const { slope, intercept } = regression(values);
  const n = values.length;

  if (method === ForecastMethod.TREND_PROJECTION) {
    return Array.from({ length: horizonDays }, (_, index) =>
      clamp(intercept + slope * (n + index), 0, Number.MAX_SAFE_INTEGER),
    );
  }

  const factors = weeklyFactors(values);
  return Array.from({ length: horizonDays }, (_, index) => {
    const trendValue = intercept + slope * (n + index);
    const factor = factors[weekday(addDays(forecastDate, index + 1))];
    return clamp(trendValue * factor, 0, Number.MAX_SAFE_INTEGER);
  });
}

/**
 * Forecasts a daily series and returns the horizon-end prediction with bounds,
 * confidence and up to 30 sampled chart points.
 */
export function computeForecast(
  method: ForecastMethod,
  history: HistoricalPoint[],
  horizonDays: number,
  forecastDate: string,
  options: ForecastOptions = {},
): ForecastComputation {
  const values = history.map((point) => Number(point.value) || 0);
  const n = values.length;
  const zScore = options.zScore ?? 1.96;

  if (n === 0) {
    return {
      predictedValue: 0,
      lowerBound: 0,
      upperBound: 0,
      confidencePct: MIN_CONFIDENCE,
      points: [],
      metadata: { dataPoints: 0, insufficientData: true },
    };
  }

  const daily = forecastDailyValues(
    method,
    values,
    horizonDays,
    forecastDate,
    options,
  );
  const predictedValue = round4(daily[daily.length - 1] ?? values[n - 1]);

  const { slope, intercept, r2 } = regression(values);
  const window = Math.max(2, options.window ?? 7);
  const fitted = values.map((_, index) => {
    if (index < window) return values[index];
    return mean(values.slice(index - window, index));
  });
  const residuals = values.map((value, index) => value - fitted[index]);
  const residualStd =
    n > window
      ? standardDeviation(residuals.slice(window))
      : standardDeviation(values);

  const dataScore = clamp((n - 7) / 60, 0, 1);
  const avg = mean(values);
  const cv = avg > 0 ? standardDeviation(values) / avg : 0;
  let confidence =
    45 + 45 * dataScore - 10 * clamp(cv, 0, 1) + 10 * clamp(r2, 0, 1);
  if (n < 7) confidence = Math.min(confidence, 45);
  const confidencePct = round4(clamp(confidence, MIN_CONFIDENCE, MAX_CONFIDENCE));

  // Residual spread drives the interval; a perfect fit still carries a small
  // model-uncertainty floor instead of collapsing the bounds onto the point.
  const dispersion =
    residualStd > 0
      ? residualStd
      : Math.max(1, Math.abs(predictedValue) * 0.01);
  const margin =
    zScore * dispersion * Math.sqrt(horizonDays / Math.max(1, n));
  const lowerBound = round4(Math.max(0, predictedValue - margin));
  const upperBound = round4(Math.max(predictedValue, predictedValue + margin));

  const step = Math.max(1, Math.ceil(horizonDays / 30));
  const points: ForecastPoint[] = [];
  for (let day = 1; day <= horizonDays; day += 1) {
    if (day % step === 0 || day === horizonDays) {
      points.push({
        date: addDays(forecastDate, day),
        value: round4(daily[day - 1]),
      });
    }
  }

  return {
    predictedValue,
    lowerBound,
    upperBound,
    confidencePct,
    points: points.slice(0, 30),
    metadata: {
      dataPoints: n,
      window,
      seasonLength: options.seasonLength ?? 7,
      zScore,
      r2: round4(r2),
      residualStd: round4(residualStd),
      slope: round4(slope),
      intercept: round4(intercept),
      mean: round4(avg),
      weekdayFactors:
        method === ForecastMethod.SEASONAL_ANALYSIS
          ? weeklyFactors(values).map(round4)
          : undefined,
    },
  };
}

