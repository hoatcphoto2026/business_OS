/**
 * D2 Revenue Intelligence.
 * Requires migration:run and seed. No global prefix, same as C5/C6/C7/D1.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Revenue Intelligence (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let monthlySnapshotId: string;

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
    // Best-effort restore so other suites see the seeded professional plan.
    try {
      await changePlan('professional');
    } catch {
      // Ignore: the assertion-bearing test already restores the plan.
    }
    await app?.close();
  });

  async function stepUp(action: string): Promise<string> {
    const initiate = await request(app.getHttpServer())
      .post('/admin/step-up/initiate')
      .set(auth(adminToken))
      .send({ action, method: 'totp' })
      .expect(201);
    const verify = await request(app.getHttpServer())
      .post('/admin/step-up/verify')
      .set(auth(adminToken))
      .send({ sessionId: initiate.body.sessionId, code: '123456' })
      .expect(201);
    return verify.body.stepUpToken as string;
  }

  async function changePlan(planCode: string): Promise<void> {
    const token = await stepUp('billing.change-plan');
    await request(app.getHttpServer())
      .post('/billing/subscription/change-plan')
      .set(auth(adminToken))
      .set('X-Step-Up-Token', token)
      .send({ planCode, billingCycle: 'MONTHLY' })
      .expect(200);
  }

  it('rejects anonymous, non-admin and non-operator callers', async () => {
    await request(app.getHttpServer()).get('/revenue/dashboard').expect(401);
    await request(app.getHttpServer())
      .get('/revenue/dashboard')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/revenue/dashboard')
      .set(auth(cafeToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/revenue/forecast')
      .set(auth(cafeToken))
      .expect(403);
  });

  it('returns the revenue dashboard with segments and forecast', async () => {
    const res = await request(app.getHttpServer())
      .get('/revenue/dashboard')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.summary.mrr).toBeGreaterThan(0);
    expect(res.body.summary.arr).toBeCloseTo(res.body.summary.mrr * 12, 2);
    expect(res.body.segments.byPlan.length).toBeGreaterThanOrEqual(1);
    expect(res.body.segments.byCountry.length).toBeGreaterThanOrEqual(1);
    expect(res.body.topCustomers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.topCustomers[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        mrr: expect.any(Number),
        sharePct: expect.any(Number),
      }),
    );
    expect(res.body.forecast.nextMonth.predictedRevenue).toBeGreaterThan(0);
    expect(res.body.forecast.quarter.predictedRevenue).toBeGreaterThan(0);
    expect(res.body.forecast.annual.predictedRevenue).toBeGreaterThan(0);
    expect(Array.isArray(res.body.trends.revenue)).toBe(true);
    expect(res.body.latestMonthly).not.toBeNull();
  });

  it('lists top customers by MRR', async () => {
    const res = await request(app.getHttpServer())
      .get('/revenue/top-customers?limit=1')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].rank).toBe(1);
    expect(res.body.customers[0].mrr).toBeGreaterThan(0);
    expect(res.body.customers[0].label).toEqual(expect.any(String));
    expect(res.body.customers[0].metadata.tenantCode).toEqual(expect.any(String));
  });

  it('forecasts next month, quarter and annual revenue', async () => {
    const all = await request(app.getHttpServer())
      .get('/revenue/forecast')
      .set(auth(adminToken))
      .expect(200);
    expect(all.body.forecasts).toHaveLength(3);
    const next = all.body.forecasts.find(
      (row: { horizon: string }) => row.horizon === 'NEXT_MONTH',
    );
    const quarter = all.body.forecasts.find(
      (row: { horizon: string }) => row.horizon === 'QUARTER',
    );
    expect(next.predictedRevenue).toBeGreaterThan(0);
    expect(quarter.predictedRevenue).toBeCloseTo(next.predictedRevenue * 3, 2);
    for (const forecast of all.body.forecasts) {
      expect(forecast.lowerBound).toBeLessThanOrEqual(forecast.predictedRevenue);
      expect(forecast.upperBound).toBeGreaterThanOrEqual(forecast.predictedRevenue);
      expect(forecast.confidence).toBeGreaterThan(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
      expect(forecast.method).toBe('MRR_GROWTH_LINEAR');
    }

    const quarterOnly = await request(app.getHttpServer())
      .get('/revenue/forecast?horizon=QUARTER')
      .set(auth(adminToken))
      .expect(200);
    expect(quarterOnly.body.forecasts).toHaveLength(1);
  });

  it('tracks upgrades, downgrades, expansion and contraction', async () => {
    await changePlan('enterprise');
    await changePlan('starter');
    await changePlan('professional');

    const trends = await request(app.getHttpServer())
      .get('/revenue/trends?months=6')
      .set(auth(adminToken))
      .expect(200);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const month = trends.body.planChanges.find(
      (row: { month: string }) => row.month === currentMonth,
    );
    expect(month).toBeDefined();
    expect(month.upgrades).toBeGreaterThanOrEqual(2);
    expect(month.downgrades).toBeGreaterThanOrEqual(1);
    expect(month.expansion).toBeGreaterThan(0);
    expect(month.contraction).toBeGreaterThan(0);

    const dashboard = await request(app.getHttpServer())
      .get('/revenue/dashboard')
      .set(auth(adminToken))
      .expect(200);
    expect(dashboard.body.summary.expansionRevenue).toBeGreaterThan(0);
    expect(dashboard.body.summary.contractionRevenue).toBeGreaterThan(0);
    expect(dashboard.body.summary.netNewRevenue).toBe(
      dashboard.body.summary.expansionRevenue -
        dashboard.body.summary.contractionRevenue,
    );
  });


  it('generates idempotent monthly and daily snapshots with segments and forecasts', async () => {
    const monthly = await request(app.getHttpServer())
      .post('/revenue/snapshots')
      .set(auth(adminToken))
      .send({ period: 'MONTHLY' })
      .expect(201);
    monthlySnapshotId = monthly.body.snapshot.id;
    expect(monthly.body.snapshot.periodType).toBe('MONTHLY');
    expect(monthly.body.snapshot.snapshotDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(Number(monthly.body.snapshot.mrr)).toBeGreaterThan(0);
    expect(monthly.body.forecasts).toHaveLength(3);
    expect(monthly.body.segments).toBeGreaterThanOrEqual(3);

    const again = await request(app.getHttpServer())
      .post('/revenue/snapshots')
      .set(auth(adminToken))
      .send({ period: 'MONTHLY' })
      .expect(201);
    expect(again.body.snapshot.id).toBe(monthlySnapshotId);

    const daily = await request(app.getHttpServer())
      .post('/revenue/snapshots')
      .set(auth(adminToken))
      .send({ period: 'DAILY' })
      .expect(201);
    expect(daily.body.snapshot.periodType).toBe('DAILY');
    expect(daily.body.snapshot.id).not.toBe(monthlySnapshotId);

    const list = await request(app.getHttpServer())
      .get('/revenue/snapshots?period=MONTHLY&limit=10')
      .set(auth(adminToken))
      .expect(200);
    expect(
      list.body.some((row: { id: string }) => row.id === monthlySnapshotId),
    ).toBe(true);
  });

  it('exposes persisted segments by plan and country', async () => {
    const period = new Date().toISOString().slice(0, 7);
    const plans = await request(app.getHttpServer())
      .get(`/revenue/segments?dimension=PLAN&period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    expect(plans.body.length).toBeGreaterThanOrEqual(1);
    const totalMrr = plans.body.reduce(
      (sum: number, row: { mrr: string }) => sum + Number(row.mrr),
      0,
    );

    const snapshot = await request(app.getHttpServer())
      .get('/revenue/snapshots?period=MONTHLY&limit=1')
      .set(auth(adminToken))
      .expect(200);
    expect(totalMrr).toBeCloseTo(Number(snapshot.body[0].mrr), 2);
    for (const row of plans.body) {
      expect(Number(row.sharePct)).toBeGreaterThanOrEqual(0);
      expect(row.label).toEqual(expect.any(String));
    }

    const countries = await request(app.getHttpServer())
      .get('/revenue/segments?dimension=COUNTRY')
      .set(auth(adminToken))
      .expect(200);
    expect(
      countries.body.some((row: { key: string }) => row.key === 'VN'),
    ).toBe(true);
  });

  it('exposes Prometheus gauges, audit records and operator-tenant storage', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/revenue/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('revenue_mrr');
    expect(metrics.text).toContain('revenue_arr');
    expect(metrics.text).toContain('revenue_expansion');
    expect(metrics.text).toContain('revenue_forecast_quarter');

    const audits = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'revenue_snapshot'`,
      [abcTenantId],
    );
    expect(audits[0].total).toBeGreaterThanOrEqual(1);

    const tenants = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM revenue_snapshots`,
    );
    expect(
      tenants.map((row: { tenant_id: string }) => row.tenant_id),
    ).toEqual([abcTenantId]);

    const forecasts = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM revenue_forecasts
        WHERE tenant_id = $1 AND as_of = CURRENT_DATE`,
      [abcTenantId],
    );
    expect(forecasts[0].total).toBe(3);

    const dashboard = await request(app.getHttpServer())
      .get('/revenue/dashboard')
      .set(auth(adminToken))
      .expect(200);
    expect(dashboard.body.latestMonthly.id).toBe(monthlySnapshotId);
  });
});

