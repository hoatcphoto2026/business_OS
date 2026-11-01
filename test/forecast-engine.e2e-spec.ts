/**
 * D7 Forecast Engine.
 * Creates deterministic 60-day platform history, then removes it in afterAll so
 * later suites (usage/support) are not polluted.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Forecast Engine (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let cafeTenantId: string;
  let adminUserId: string;
  let planId: string;
  let createdRunId: string;
  const testTenantIds: string[] = [];

  const PASSWORD = 'Password123!';
  const stamp = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const cleanup = async () => {
    await dataSource.query(
      `DELETE FROM billing_invoices WHERE invoice_number LIKE 'FC-E2E-%'`,
    );
    await dataSource.query(
      `DELETE FROM usage_records WHERE metadata->>'source' = 'forecast-e2e'`,
    );
    await dataSource.query(
      `DELETE FROM support_tickets WHERE subject LIKE 'FC-E2E%'`,
    );
    await dataSource.query(
      `DELETE FROM subscriptions WHERE tenant_id IN (
         SELECT id FROM tenants WHERE code LIKE 'FC-E2E-%')`,
    );
    await dataSource.query(`DELETE FROM tenants WHERE code LIKE 'FC-E2E-%'`);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    const login = async (email: string, tenant: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      return res.body.accessToken as string;
    };
    adminToken = await login('admin@abctrading.vn', 'ABC');
    salesToken = await login('hcm.user@abctrading.vn', 'ABC');
    cafeToken = await login('owner@cafemoc.vn', 'CAFE_MOC');

    const tenants = await dataSource.query(
      "SELECT id, code FROM tenants WHERE code IN ('ABC', 'CAFE_MOC')",
    );
    abcTenantId = tenants.find((row: { code: string }) => row.code === 'ABC').id;
    cafeTenantId = tenants.find(
      (row: { code: string }) => row.code === 'CAFE_MOC',
    ).id;

    const [admin] = await dataSource.query(
      "SELECT id FROM users WHERE email = 'admin@abctrading.vn'",
    );
    adminUserId = admin.id;
    const [plan] = await dataSource.query(
      "SELECT id FROM plans WHERE code = 'professional'",
    );
    planId = plan.id;

    await cleanup();

    // 60 days of strictly rising revenue.
    await dataSource.query(
      `INSERT INTO billing_invoices
         (id, tenant_id, invoice_number, status, currency, subtotal, tax_rate,
          tax_amount, discount_amount, total, amount_paid, issued_at, paid_at,
          created_at, updated_at)
       SELECT gen_random_uuid(), $1, 'FC-E2E-' || $2 || '-' || d, 'PAID', 'VND',
              amt, 0, 0, 0, amt, amt, ts, ts, now(), now()
         FROM generate_series(0, 59) AS d,
              LATERAL (
                SELECT now() - make_interval(days => 59 - d) AS ts,
                       (100000 + d * 5000)::numeric AS amt
              ) AS x`,
      [abcTenantId, stamp],
    );

    // 60 days of usage.
    await dataSource.query(
      `INSERT INTO usage_records
         (id, tenant_id, metric, quantity, recorded_at, metadata, created_at, updated_at)
       SELECT gen_random_uuid(), $1, 'AI_REQUESTS', 50 + d,
              now() - make_interval(days => 59 - d),
              '{"source":"forecast-e2e"}'::jsonb, now(), now()
         FROM generate_series(0, 59) AS d`,
      [abcTenantId],
    );

    // 60 days of support tickets.
    await dataSource.query(
      `INSERT INTO support_tickets
         (id, tenant_id, subject, description, status, priority, requester_id,
          metadata, created_at, updated_at)
       SELECT gen_random_uuid(), $1, 'FC-E2E ticket ' || d, 'forecast seed',
              'OPEN', 'LOW', $2, '{"source":"forecast-e2e"}'::jsonb,
              now() - make_interval(days => 59 - d), now()
         FROM generate_series(0, 59) AS d`,
      [abcTenantId, adminUserId],
    );

    // Five new customers + five cancelled subscriptions (growth & churn series).
    for (let i = 0; i < 5; i += 1) {
      const daysAgo = 55 - i * 12;
      const [tenant] = await dataSource.query(
        `INSERT INTO tenants
           (id, code, slug, name, plan, status, settings, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'starter', 'active', '{}'::jsonb,
                 now() - make_interval(days => $4), now())
         RETURNING id`,
        [
          `FC-E2E-${stamp}-${i}`,
          `fc-e2e-${stamp}-${i}`,
          `Forecast E2E ${i}`,
          daysAgo,
        ],
      );
      testTenantIds.push(tenant.id);
      await dataSource.query(
        `INSERT INTO subscriptions
           (id, tenant_id, plan_id, status, billing_cycle, cancelled_at, metadata,
            created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'CANCELLED', 'MONTHLY',
                 now() - make_interval(days => $3), '{}'::jsonb,
                 now() - make_interval(days => $4), now())`,
        [tenant.id, planId, daysAgo, daysAgo + 5],
      );
    }
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('rejects anonymous, non-admin and non-operator callers', async () => {
    await request(app.getHttpServer()).get('/forecast').expect(401);
    await request(app.getHttpServer())
      .get('/forecast')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/forecast/run')
      .set(auth(cafeToken))
      .send({})
      .expect(403);
  });

  it('exposes the seeded model matrix before any run', async () => {
    const res = await request(app.getHttpServer())
      .get('/forecast')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.run).toBeNull();
    expect(res.body.results).toEqual([]);
    expect(res.body.models.length).toBeGreaterThanOrEqual(15);
    const pairs = new Set(
      res.body.models.map((row: { metric: string; method: string }) =>
        `${row.metric}:${row.method}`,
      ),
    );
    expect(pairs.size).toBe(res.body.models.length);
  });

  it('runs all metrics/methods/horizons and persists 45 results', async () => {
    const res = await request(app.getHttpServer())
      .post('/forecast/run')
      .set(auth(adminToken))
      .send({})
      .expect(201);

    createdRunId = res.body.run.id;
    expect(res.body.run.status).toBe('COMPLETED');
    expect(res.body.run.metrics).toHaveLength(5);
    expect(res.body.run.methods).toHaveLength(3);
    expect(res.body.run.horizons).toEqual([30, 90, 365]);
    expect(res.body.run.resultsCount).toBe(45);
    expect(res.body.run.dataPoints).toBeGreaterThanOrEqual(60);
    expect(res.body.results).toHaveLength(45);
  });

  it('returns bounded, confident forecasts with chart points', async () => {
    const res = await request(app.getHttpServer())
      .get(`/forecast?runId=${createdRunId}`)
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.results).toHaveLength(45);
    const combos = new Set(
      res.body.results.map(
        (row: { metric: string; method: string; horizonDays: number }) =>
          `${row.metric}:${row.method}:${row.horizonDays}`,
      ),
    );
    expect(combos.size).toBe(45);

    for (const row of res.body.results) {
      expect(row.predictedValue).toBeGreaterThanOrEqual(0);
      expect(row.lowerBound).toBeLessThanOrEqual(row.predictedValue);
      expect(row.upperBound).toBeGreaterThanOrEqual(row.predictedValue);
      expect(row.confidencePct).toBeGreaterThanOrEqual(30);
      expect(row.confidencePct).toBeLessThanOrEqual(95);
      expect(row.points.length).toBeLessThanOrEqual(30);
      expect(row.points.length).toBeGreaterThan(0);
    }
  });


  it('projects rising revenue upward and ends points on the horizon', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/forecast?runId=${createdRunId}&metric=REVENUE&method=TREND_PROJECTION&horizon=30`,
      )
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.results).toHaveLength(1);
    const result = res.body.results[0];
    expect(result.predictedValue).toBeGreaterThan(300000);
    expect(result.metadata.slope).toBeGreaterThan(0);
    expect(result.metadata.dataPoints).toBeGreaterThanOrEqual(60);

    const [{ d: expectedDate }] = await dataSource.query(
      "SELECT (CURRENT_DATE + 30)::text AS d",
    );
    expect(result.points[result.points.length - 1].date).toBe(expectedDate);

    expect(res.body.summary.REVENUE.TREND_PROJECTION['30'].predictedValue).toBe(
      result.predictedValue,
    );
  });

  it('validates forecast filters and payloads', async () => {
    await request(app.getHttpServer())
      .get('/forecast?horizon=45')
      .set(auth(adminToken))
      .expect(400);
    await request(app.getHttpServer())
      .get('/forecast?metric=NOPE')
      .set(auth(adminToken))
      .expect(400);
    await request(app.getHttpServer())
      .post('/forecast/run')
      .set(auth(adminToken))
      .send({ methods: ['NOPE'] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/forecast/run')
      .set(auth(adminToken))
      .send({ horizons: [45] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/forecast/run')
      .set(auth(adminToken))
      .send({ lookbackDays: 5 })
      .expect(400);
  });

  it('lists run history with metric/method/status filters', async () => {
    const all = await request(app.getHttpServer())
      .get('/forecast/history?limit=10')
      .set(auth(adminToken))
      .expect(200);
    expect(all.body.total).toBeGreaterThanOrEqual(1);
    expect(all.body.items[0].id).toBe(createdRunId);
    expect(all.body.items[0].status).toBe('COMPLETED');

    const completed = await request(app.getHttpServer())
      .get('/forecast/history?status=COMPLETED')
      .set(auth(adminToken))
      .expect(200);
    expect(
      completed.body.items.every(
        (row: { status: string }) => row.status === 'COMPLETED',
      ),
    ).toBe(true);

    const byMetric = await request(app.getHttpServer())
      .get('/forecast/history?metric=REVENUE&method=SEASONAL_ANALYSIS')
      .set(auth(adminToken))
      .expect(200);
    expect(byMetric.body.total).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .get('/forecast/history?status=NOPE')
      .set(auth(adminToken))
      .expect(400);
  });

  it('re-runs a subset without duplicating models', async () => {
    const res = await request(app.getHttpServer())
      .post('/forecast/run')
      .set(auth(adminToken))
      .send({
        metrics: ['REVENUE'],
        methods: ['MOVING_AVERAGE'],
        horizons: [30],
        lookbackDays: 60,
      })
      .expect(201);

    expect(res.body.run.metrics).toEqual(['REVENUE']);
    expect(res.body.run.resultsCount).toBe(1);
    expect(res.body.results[0].horizonDays).toBe(30);
    expect(res.body.results[0].method).toBe('MOVING_AVERAGE');

    const models = await request(app.getHttpServer())
      .get('/forecast/models')
      .set(auth(adminToken))
      .expect(200);
    expect(models.body).toHaveLength(15);
    for (const model of models.body) {
      expect(model.status).toBe('ACTIVE');
      expect(model.parameters.window).toBe(7);
      expect(model.lastRunAt).not.toBeNull();
    }

    const history = await request(app.getHttpServer())
      .get('/forecast/history')
      .set(auth(adminToken))
      .expect(200);
    expect(history.body.total).toBeGreaterThanOrEqual(2);
  });


  it('exposes Prometheus metrics for the forecast engine', async () => {
    const res = await request(app.getHttpServer())
      .get('/forecast/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('forecast_runs_total');
    expect(res.text).toContain('forecast_results_total');
    expect(res.text).toContain('forecast_latest_value');
    expect(res.text).toContain('forecast_confidence_pct');
    expect(res.text).toContain('metric="REVENUE"');
  });

  it('stores runs/results under the operator tenant and writes an audit trail', async () => {
    const runs = await dataSource.query(
      `SELECT tenant_id, status FROM forecast_runs WHERE id = $1`,
      [createdRunId],
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].tenant_id).toBe(abcTenantId);
    expect(runs[0].tenant_id).not.toBe(cafeTenantId);

    const results = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM forecast_results WHERE run_id = $1`,
      [createdRunId],
    );
    expect(results).toHaveLength(1);
    expect(results[0].tenant_id).toBe(abcTenantId);

    const audit = await dataSource.query(
      `SELECT action FROM audit_logs
        WHERE entity_type = 'forecast_run' AND entity_id = $1`,
      [createdRunId],
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0].action).toBe('CREATE');

    const models = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM forecast_models WHERE tenant_id = $1`,
      [abcTenantId],
    );
    expect(models[0].total).toBe(15);
  });
});

