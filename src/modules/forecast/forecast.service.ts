import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ForecastModel } from './entities/forecast-model.entity';
import { ForecastRun } from './entities/forecast-run.entity';
import { ForecastResult } from './entities/forecast-result.entity';
import {
  FORECAST_HORIZONS,
  FORECAST_METRIC_DEFINITIONS,
  FORECAST_METHODS,
  FORECAST_METRICS,
  ForecastMethod,
  ForecastMetric,
  ForecastModelStatus,
  ForecastRunStatus,
} from './enums/forecast.enum';
import {
  ForecastHistoryQueryDto,
  ForecastQueryDto,
  RunForecastDto,
} from './dto/forecast.dto';
import { ForecastDataService } from './forecast-data.service';
import { computeForecast, ForecastOptions } from './forecast-math';
import { platformOperatorEmails } from '../executive/platform-operators';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

/** EPIC D7 – Forecast Engine for platform metrics. */
@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);

  constructor(
    @InjectRepository(ForecastModel)
    private readonly models: Repository<ForecastModel>,
    @InjectRepository(ForecastRun)
    private readonly runs: Repository<ForecastRun>,
    @InjectRepository(ForecastResult)
    private readonly results: Repository<ForecastResult>,
    private readonly dataSource: DataSource,
    private readonly data: ForecastDataService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly promMetrics: MetricsService,
  ) {}

  private currentUserId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  async operatorTenantId(): Promise<string> {
    try {
      return this.tenantContext.getCurrentTenantId();
    } catch {
      // No ALS (scheduler/seed): resolve from the operator allowlist below.
    }
    const emails = platformOperatorEmails();
    if (emails.length === 0) {
      throw new NotFoundException('No platform operator configured');
    }
    const rows = await this.dataSource.query(
      `SELECT tu.tenant_id
         FROM users u
         JOIN tenant_users tu ON tu.user_id = u.id
        WHERE lower(u.email) = ANY($1)
        ORDER BY tu.created_at ASC
        LIMIT 1`,
      [emails],
    );
    if (!rows.length) {
      throw new NotFoundException('Operator tenant not found');
    }
    return rows[0].tenant_id as string;
  }

  private async ensureModels(
    tenantId: string,
    metrics: ForecastMetric[],
    methods: ForecastMethod[],
  ): Promise<Map<string, ForecastModel>> {
    const existing = await this.models.find({ where: { tenantId } });
    const map = new Map<string, ForecastModel>();
    for (const model of existing) {
      map.set(`${model.metric}:${model.method}`, model);
    }

    const missing: ForecastModel[] = [];
    for (const metric of metrics) {
      const definition = FORECAST_METRIC_DEFINITIONS.find(
        (item) => item.metric === metric,
      );
      for (const method of methods) {
        const key = `${metric}:${method}`;
        if (map.has(key)) continue;
        const saved = await this.models.save(
          this.models.create({
            tenantId,
            metric,
            method,
            name: `${definition?.label ?? metric} · ${method}`,
            description: definition?.description ?? null,
            parameters: { window: 7, seasonLength: 7, zScore: 1.96 },
            status: ForecastModelStatus.ACTIVE,
            version: 1,
          }),
        );
        map.set(key, saved);
        missing.push(saved);
      }
    }
    if (missing.length) {
      this.logger.log(
        `Forecast models provisioned: ${missing.length} (tenant ${tenantId})`,
      );
    }
    return map;
  }

  async run(dto: RunForecastDto = {}) {
    const tenantId = await this.operatorTenantId();
    const userId = this.currentUserId();
    const metrics = dto.metrics?.length
      ? [...new Set(dto.metrics)]
      : [...FORECAST_METRICS];
    const methods = dto.methods?.length
      ? [...new Set(dto.methods)]
      : [...FORECAST_METHODS];
    const horizons = (
      dto.horizons?.length ? [...new Set(dto.horizons)] : [...FORECAST_HORIZONS]
    ).sort((a, b) => a - b);
    const lookbackDays = dto.lookbackDays ?? 90;

    const modelMap = await this.ensureModels(tenantId, metrics, methods);
    const run = await this.runs.save(
      this.runs.create({
        tenantId,
        createdBy: userId,
        status: ForecastRunStatus.RUNNING,
        metrics,
        methods,
        horizons,
        lookbackDays,
        requestedBy: userId,
        metadata: {},
      }),
    );

    try {
      let dataPoints = 0;
      const saved: ForecastResult[] = [];

      for (const metric of metrics) {
        const series = await this.data.loadSeries(metric, lookbackDays);
        dataPoints = Math.max(dataPoints, series.length);
        const forecastDate =
          series[series.length - 1]?.date ??
          new Date().toISOString().slice(0, 10);

        for (const method of methods) {
          const model = modelMap.get(`${metric}:${method}`);
          const parameters = (model?.parameters ?? {}) as ForecastOptions;

          for (const horizonDays of horizons) {
            const computed = computeForecast(
              method,
              series,
              horizonDays,
              forecastDate,
              parameters,
            );
            saved.push(
              this.results.create({
                tenantId,
                createdBy: userId,
                runId: run.id,
                metric,
                method,
                horizonDays,
                lookbackDays,
                predictedValue: computed.predictedValue.toFixed(4),
                lowerBound: computed.lowerBound.toFixed(4),
                upperBound: computed.upperBound.toFixed(4),
                confidencePct: computed.confidencePct.toFixed(2),
                points: computed.points,
                metadata: computed.metadata,
              }),
            );
            this.promMetrics.set(
              'forecast_latest_value',
              computed.predictedValue,
              { metric, method, horizon: String(horizonDays) },
            );
            this.promMetrics.set(
              'forecast_confidence_pct',
              computed.confidencePct,
              { metric, method, horizon: String(horizonDays) },
            );
            this.promMetrics.inc('forecast_results_total', { metric });
          }

          if (model) {
            model.lastRunAt = new Date();
            model.updatedBy = userId;
            await this.models.save(model);
          }
        }
      }

      await this.results.save(saved);
      run.status = ForecastRunStatus.COMPLETED;
      run.resultsCount = saved.length;
      run.dataPoints = dataPoints;
      run.completedAt = new Date();
      const completed = await this.runs.save(run);

      this.promMetrics.inc('forecast_runs_total', {
        status: ForecastRunStatus.COMPLETED,
      });
      await this.auditSafe(completed.id, {
        metrics,
        methods,
        horizons,
        lookbackDays,
        results: saved.length,
      });

      return {
        run: completed,
        results: saved.map((row) => this.serialize(row)),
      };
    } catch (error) {
      run.status = ForecastRunStatus.FAILED;
      run.errorMessage =
        error instanceof Error ? error.message : String(error);
      run.completedAt = new Date();
      await this.runs.save(run);
      this.promMetrics.inc('forecast_runs_total', {
        status: ForecastRunStatus.FAILED,
      });
      throw error;
    }
  }


  async latest(query: ForecastQueryDto = {}) {
    const tenantId = await this.operatorTenantId();
    const models = await this.listModels();

    let run: ForecastRun | null = null;
    if (query.runId) {
      run = await this.runs.findOne({ where: { id: query.runId, tenantId } });
      if (!run) throw new NotFoundException('Forecast run not found');
    } else {
      run = await this.runs.findOne({
        where: { tenantId, status: ForecastRunStatus.COMPLETED },
        order: { startedAt: 'DESC' },
      });
    }

    if (!run) {
      return {
        generatedAt: new Date().toISOString(),
        run: null,
        results: [],
        summary: {},
        models,
      };
    }

    const where: Record<string, unknown> = { tenantId, runId: run.id };
    if (query.metric) where.metric = query.metric;
    if (query.method) where.method = query.method;
    if (query.horizon) where.horizonDays = query.horizon;

    const results = await this.results.find({
      where,
      order: { metric: 'ASC', method: 'ASC', horizonDays: 'ASC' },
    });
    this.applyGauges(results);

    const summary: Record<
      string,
      Record<
        string,
        Record<
          string,
          {
            predictedValue: number;
            lowerBound: number;
            upperBound: number;
            confidencePct: number;
          }
        >
      >
    > = {};
    for (const row of results) {
      summary[row.metric] ??= {};
      summary[row.metric][row.method] ??= {};
      summary[row.metric][row.method][String(row.horizonDays)] = {
        predictedValue: Number(row.predictedValue),
        lowerBound: Number(row.lowerBound),
        upperBound: Number(row.upperBound),
        confidencePct: Number(row.confidencePct),
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      run,
      results: results.map((row) => this.serialize(row)),
      summary,
      models,
    };
  }

  async history(query: ForecastHistoryQueryDto = {}) {
    const tenantId = await this.operatorTenantId();
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.runs
      .createQueryBuilder('run')
      .where('run.tenantId = :tenantId', { tenantId });

    if (query.status) {
      qb.andWhere('run.status = :status', { status: query.status });
    }
    if (query.metric) {
      qb.andWhere('run.metrics @> CAST(:metric AS jsonb)', {
        metric: JSON.stringify([query.metric]),
      });
    }
    if (query.method) {
      qb.andWhere('run.methods @> CAST(:method AS jsonb)', {
        method: JSON.stringify([query.method]),
      });
    }

    const [items, total] = await qb
      .orderBy('run.startedAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { total, limit, offset, items };
  }

  listModels(): Promise<ForecastModel[]> {
    return this.operatorTenantId().then((tenantId) =>
      this.models.find({
        where: { tenantId },
        order: { metric: 'ASC', method: 'ASC' },
      }),
    );
  }

  async prometheusText(): Promise<string> {
    const tenantId = await this.operatorTenantId();
    const run = await this.runs.findOne({
      where: { tenantId, status: ForecastRunStatus.COMPLETED },
      order: { startedAt: 'DESC' },
    });
    if (run) {
      const results = await this.results.find({
        where: { tenantId, runId: run.id },
      });
      this.applyGauges(results);
    }
    return this.promMetrics.text();
  }

  private applyGauges(rows: ForecastResult[]): void {
    const perMetric = new Map<string, number>();
    for (const row of rows) {
      const labels = {
        metric: row.metric,
        method: row.method,
        horizon: String(row.horizonDays),
      };
      this.promMetrics.set(
        'forecast_latest_value',
        Number(row.predictedValue),
        labels,
      );
      this.promMetrics.set(
        'forecast_confidence_pct',
        Number(row.confidencePct),
        labels,
      );
      perMetric.set(row.metric, (perMetric.get(row.metric) ?? 0) + 1);
    }
    for (const [metric, count] of perMetric) {
      this.promMetrics.set('forecast_results_stored', count, { metric });
    }
  }

  private serialize(row: ForecastResult) {
    return {
      id: row.id,
      runId: row.runId,
      metric: row.metric,
      method: row.method,
      horizonDays: row.horizonDays,
      lookbackDays: row.lookbackDays,
      predictedValue: Number(row.predictedValue),
      lowerBound: Number(row.lowerBound),
      upperBound: Number(row.upperBound),
      confidencePct: Number(row.confidencePct),
      points: row.points,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  private async auditSafe(
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('forecast_run', id, AuditAction.CREATE, {
        newData: data,
      });
    } catch (error) {
      this.logger.warn(
        `Forecast audit skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}

