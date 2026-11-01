/**
 * D1 Executive Metrics Platform.
 * Requires migration:run and seed. No global prefix, same as C5/C6/C7.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Executive Metrics (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let dailySnapshotId: string;
  let monthlySnapshotId: string;
  let mrrValue: number;

  const PASSWORD = 'Password123!';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
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

    const rows = await dataSource.query(
      "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
    );
    abcTenantId = rows[0].id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous, non-admin and non-operator callers', async () => {
    await request(app.getHttpServer()).get('/executive/metrics').expect(401);
    await request(app.getHttpServer())
      .get('/executive/metrics')
      .set(auth(salesToken))
      .expect(403);
    // Cafe owner has admin.access but is not a platform operator.
    await request(app.getHttpServer())
      .get('/executive/metrics')
      .set(auth(cafeToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/executive/dashboard')
      .set(auth(cafeToken))
      .expect(403);
  });

  it('returns the twelve executive KPIs', async () => {
    const res = await request(app.getHttpServer())
      .get('/executive/metrics')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.metrics).toHaveLength(12);
    const codes = res.body.metrics.map((metric: { code: string }) => metric.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'MRR',
        'ARR',
        'ARPU',
        'LTV',
        'CUSTOMER_COUNT',
        'ACTIVE_USERS',
        'ACTIVE_TENANTS',
        'TRIAL_CONVERSIONS',
        'PAID_CONVERSIONS',
        'REVENUE_GROWTH',
        'RETENTION_RATE',
        'CHURN_RATE',
      ]),
    );

    const summary = res.body.summary;
    mrrValue = summary.mrr;
    expect(summary.mrr).toBeGreaterThan(0);
    expect(summary.arr).toBeCloseTo(summary.mrr * 12, 2);
    expect(summary.paidCustomers).toBeGreaterThanOrEqual(1);
    expect(summary.arpu).toBeCloseTo(summary.mrr / summary.paidCustomers, 2);
    expect(summary.customerCount).toBeGreaterThanOrEqual(2);
    expect(summary.activeTenants).toBeGreaterThanOrEqual(2);
    expect(summary.activeUsers).toBeGreaterThanOrEqual(2);
    expect(summary.retentionRate).toBeGreaterThanOrEqual(0);
    expect(summary.retentionRate).toBeLessThanOrEqual(100);
    expect(summary.churnRate).toBeCloseTo(100 - summary.retentionRate, 2);

    const mrr = res.body.metrics.find(
      (metric: { code: string }) => metric.code === 'MRR',
    );
    expect(mrr.unit).toBe('CURRENCY');
    expect(typeof mrr.changePct).toBe('number');
  });

  it('generates an idempotent daily snapshot', async () => {
    const first = await request(app.getHttpServer())
      .post('/executive/snapshots')
      .set(auth(adminToken))
      .send({ period: 'DAILY' })
      .expect(201);
    dailySnapshotId = first.body.id;
    expect(first.body.periodType).toBe('DAILY');
    expect(first.body.snapshotDate).toEqual(expect.any(String));
    expect(first.body.metrics).toHaveLength(12);
    expect(first.body.summary.mrr).toBeCloseTo(mrrValue, 2);

    const second = await request(app.getHttpServer())
      .post('/executive/snapshots')
      .set(auth(adminToken))
      .send({ period: 'DAILY' })
      .expect(201);
    expect(second.body.id).toBe(dailySnapshotId);

    const historyRows = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM metric_history
        WHERE tenant_id = $1 AND period_type = 'DAILY'
          AND recorded_at::date = CURRENT_DATE`,
      [abcTenantId],
    );
    expect(historyRows[0].total).toBe(12);
  });

  it('generates a monthly snapshot and exposes history series', async () => {
    const monthly = await request(app.getHttpServer())
      .post('/executive/snapshots')
      .set(auth(adminToken))
      .send({ period: 'MONTHLY' })
      .expect(201);
    monthlySnapshotId = monthly.body.id;
    expect(monthly.body.periodType).toBe('MONTHLY');
    expect(monthly.body.snapshotDate).toMatch(/^\d{4}-\d{2}-01$/);

    const history = await request(app.getHttpServer())
      .get('/executive/metrics/history?code=MRR&period=DAILY')
      .set(auth(adminToken))
      .expect(200);
    expect(history.body.series).toHaveLength(1);
    expect(history.body.series[0].code).toBe('MRR');
    expect(history.body.series[0].points.length).toBeGreaterThanOrEqual(1);
    expect(history.body.series[0].points[0].value).toBeGreaterThan(0);

    const monthlyHistory = await request(app.getHttpServer())
      .get('/executive/metrics/history?period=MONTHLY')
      .set(auth(adminToken))
      .expect(200);
    expect(monthlyHistory.body.series.length).toBeGreaterThanOrEqual(1);
  });


  it('returns the executive dashboard with snapshots and trends', async () => {
    const res = await request(app.getHttpServer())
      .get('/executive/dashboard')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.kpis.mrr).toBeGreaterThan(0);
    expect(res.body.latestDaily.id).toBe(dailySnapshotId);
    expect(res.body.latestMonthly.id).toBe(monthlySnapshotId);
    expect(res.body.trends.mrr.length).toBeGreaterThanOrEqual(1);
    expect(res.body.trends.activeTenants.length).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics).toHaveLength(12);
  });

  it('lists snapshots and exposes Prometheus gauges', async () => {
    const snapshots = await request(app.getHttpServer())
      .get('/executive/snapshots?period=DAILY&limit=10')
      .set(auth(adminToken))
      .expect(200);
    expect(
      snapshots.body.some((row: { id: string }) => row.id === dailySnapshotId),
    ).toBe(true);
    expect(
      snapshots.body.every(
        (row: { periodType: string }) => row.periodType === 'DAILY',
      ),
    ).toBe(true);

    const prom = await request(app.getHttpServer())
      .get('/executive/metrics/prometheus')
      .set(auth(adminToken))
      .expect(200);
    expect(prom.headers['content-type']).toContain('text/plain');
    expect(prom.text).toContain('executive_mrr');
    expect(prom.text).toContain('executive_arr');
    expect(prom.text).toContain('executive_active_tenants');
    expect(prom.text).toContain('executive_churn_rate_pct');
  });

  it('caches metric values and writes audit records under the operator tenant', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/executive/metrics')
      .set(auth(adminToken))
      .expect(200);
    const mrr = metrics.body.metrics.find(
      (metric: { code: string }) => metric.code === 'MRR',
    );
    expect(mrr.previousValue).not.toBeUndefined();
    expect(typeof mrr.changePct).toBe('number');

    const cached = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM executive_metrics WHERE tenant_id = $1`,
      [abcTenantId],
    );
    expect(cached[0].total).toBe(12);

    const audits = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'executive_snapshot'`,
      [abcTenantId],
    );
    expect(audits[0].total).toBeGreaterThanOrEqual(2);

    const snapshotTenants = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM executive_snapshots`,
    );
    expect(
      snapshotTenants.map((row: { tenant_id: string }) => row.tenant_id),
    ).toEqual([abcTenantId]);
  });
});

