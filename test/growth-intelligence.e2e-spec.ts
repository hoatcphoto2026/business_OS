/**
 * D5 Growth Intelligence.
 * Requires migration:run and seed. No global prefix, same as C5/C6/C7/D1-D4.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Growth Intelligence (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let experimentId: string;
  let monthlySnapshotId: string;

  const PASSWORD = 'Password123!';
  const stamp = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const period = new Date().toISOString().slice(0, 7);

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

    const tenants = await dataSource.query(
      "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
    );
    abcTenantId = tenants[0].id as string;
  });

  afterAll(async () => {
    try {
      await changePlan('professional');
    } catch {
      // Ignore: the plan-change test already restores the professional plan.
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
    await request(app.getHttpServer()).get('/growth').expect(401);
    await request(app.getHttpServer())
      .get('/growth')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/growth')
      .set(auth(cafeToken))
      .expect(403);
  });

  it('returns the growth dashboard with funnel and segments', async () => {
    const res = await request(app.getHttpServer())
      .get('/growth')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.totals.tenants).toBeGreaterThanOrEqual(2);
    expect(res.body.totals.paidTenants).toBeGreaterThanOrEqual(2);
    expect(res.body.totals.activatedTenants).toBeGreaterThanOrEqual(2);
    expect(res.body.metrics.activationRatePct).toBeGreaterThan(0);
    expect(res.body.metrics.paidConversionPct).toBeGreaterThanOrEqual(0);
    expect(res.body.metrics.trialConversionPct).toBeGreaterThanOrEqual(0);
    expect(res.body.metrics.onboardingSuccessPct).toBeGreaterThanOrEqual(0);
    expect(res.body.funnel.stages).toHaveLength(4);
    expect(res.body.planFunnel.transitions).toEqual(expect.any(Array));
    expect(res.body.segments.bySource.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.segments.bySource.some(
        (row: { key: string }) => row.key === 'direct',
      ),
    ).toBe(true);
    expect(res.body.segments.byPlan.length).toBeGreaterThanOrEqual(1);
    expect(res.body.experiments.total).toBeGreaterThanOrEqual(0);
    expect(res.body.latestMonthly).not.toBeNull();
  });

  it('returns the conversion funnel and plan upgrade funnel', async () => {
    const res = await request(app.getHttpServer())
      .get('/growth/funnel?days=30')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.days).toBe(30);
    expect(res.body.funnel.stages).toHaveLength(4);
    expect(res.body.funnel.stages[0].key).toBe('TENANTS');
    for (const stage of res.body.funnel.stages) {
      expect(stage.count).toBeGreaterThanOrEqual(0);
      expect(stage.rateFromPreviousPct).toBeGreaterThanOrEqual(0);
    }
    expect(res.body.planFunnel.upgrades).toBeGreaterThanOrEqual(0);
    expect(res.body.planFunnel.downgrades).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.planFunnel.transitions)).toBe(true);
    expect(typeof res.body.onboarding.completedPct).toBe('number');
  });

  it('returns conversion metrics with acquisition sources', async () => {
    const res = await request(app.getHttpServer())
      .get('/growth/conversions?days=30')
      .set(auth(adminToken))
      .expect(200);

    const metrics = res.body.metrics;
    for (const key of [
      'trialConversionPct',
      'paidConversionPct',
      'expansionRatePct',
      'upsellRatePct',
      'activationRatePct',
      'onboardingSuccessPct',
    ]) {
      expect(metrics[key]).toBeGreaterThanOrEqual(0);
    }
    expect(metrics.activationRatePct).toBeGreaterThan(0);
    expect(metrics.paidConversionPct).toBeGreaterThan(0);
    expect(metrics.trialConversionPct).toBeLessThanOrEqual(100);
    expect(res.body.details.paidConverted).toBeGreaterThanOrEqual(1);
    expect(res.body.details.subscriptionsCreated).toBeGreaterThanOrEqual(1);
    expect(
      res.body.bySource.some((row: { key: string }) => row.key === 'direct'),
    ).toBe(true);
  });

  it('exposes persisted segments by source and plan', async () => {
    const sources = await request(app.getHttpServer())
      .get(`/growth/segments?dimension=SOURCE&period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    expect(sources.body.length).toBeGreaterThanOrEqual(1);
    const direct = sources.body.find(
      (row: { segmentKey: string }) => row.segmentKey === 'direct',
    );
    expect(direct).toBeDefined();
    expect(direct.tenants).toBeGreaterThanOrEqual(1);

    const plans = await request(app.getHttpServer())
      .get(`/growth/segments?dimension=PLAN&period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    const keys = plans.body.map((row: { segmentKey: string }) => row.segmentKey);
    expect(keys).toEqual(expect.arrayContaining(['professional']));
    const shareTotal = plans.body.reduce(
      (sum: number, row: { sharePct: string }) => sum + Number(row.sharePct),
      0,
    );
    expect(shareTotal).toBeGreaterThan(0);
    expect(shareTotal).toBeLessThanOrEqual(100.5);
  });

  it('creates a growth experiment and computes uplift', async () => {
    const created = await request(app.getHttpServer())
      .post('/growth/experiments')
      .set(auth(adminToken))
      .send({
        name: `Onboarding CTA test ${stamp}`,
        hypothesis: 'A guided CTA lifts activation',
        status: 'RUNNING',
        audience: 'NEW_TENANTS',
        sampleA: 100,
        sampleB: 100,
        conversionA: 10,
        conversionB: 14,
      })
      .expect(201);
    experimentId = created.body.id;
    expect(created.body.status).toBe('RUNNING');
    expect(Number(created.body.upliftPct)).toBeCloseTo(40, 2);
    expect(created.body.startedAt).toBeTruthy();

    const listed = await request(app.getHttpServer())
      .get('/growth/experiments?status=RUNNING')
      .set(auth(adminToken))
      .expect(200);
    expect(
      listed.body.some((row: { id: string }) => row.id === experimentId),
    ).toBe(true);

    const completed = await request(app.getHttpServer())
      .patch(`/growth/experiments/${experimentId}`)
      .set(auth(adminToken))
      .send({ status: 'COMPLETED', conversionB: 15 })
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');
    expect(Number(completed.body.upliftPct)).toBeCloseTo(50, 2);
    expect(completed.body.endedAt).toBeTruthy();
  });


  it('tracks plan upgrades in the funnel and upsell/expansion metrics', async () => {
    await changePlan('enterprise');
    await changePlan('professional');

    const funnel = await request(app.getHttpServer())
      .get('/growth/funnel?days=30')
      .set(auth(adminToken))
      .expect(200);
    expect(funnel.body.planFunnel.upgrades).toBeGreaterThanOrEqual(1);
    expect(funnel.body.planFunnel.downgrades).toBeGreaterThanOrEqual(1);
    expect(
      funnel.body.planFunnel.transitions.some(
        (row: { from: string; to: string; direction: string }) =>
          row.from === 'professional' &&
          row.to === 'enterprise' &&
          row.direction === 'UPGRADE',
      ),
    ).toBe(true);
    expect(
      funnel.body.planFunnel.transitions.some(
        (row: { from: string; to: string; direction: string }) =>
          row.from === 'enterprise' &&
          row.to === 'professional' &&
          row.direction === 'DOWNGRADE',
      ),
    ).toBe(true);

    const conversions = await request(app.getHttpServer())
      .get('/growth/conversions?days=30')
      .set(auth(adminToken))
      .expect(200);
    expect(conversions.body.metrics.upsellRatePct).toBeGreaterThan(0);
    expect(conversions.body.metrics.expansionRatePct).toBeGreaterThan(0);
    expect(conversions.body.details.upgradeTenants).toBeGreaterThanOrEqual(1);
  });

  it('generates idempotent monthly and daily snapshots with segments', async () => {
    const monthly = await request(app.getHttpServer())
      .post('/growth/snapshots')
      .set(auth(adminToken))
      .send({ period: 'MONTHLY' })
      .expect(201);
    monthlySnapshotId = monthly.body.snapshot.id;
    expect(monthly.body.snapshot.periodType).toBe('MONTHLY');
    expect(monthly.body.snapshot.snapshotDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(monthly.body.snapshot.tenants).toBeGreaterThanOrEqual(2);
    expect(monthly.body.segments).toBeGreaterThanOrEqual(2);

    const again = await request(app.getHttpServer())
      .post('/growth/snapshots')
      .set(auth(adminToken))
      .send({ period: 'MONTHLY' })
      .expect(201);
    expect(again.body.snapshot.id).toBe(monthlySnapshotId);

    const daily = await request(app.getHttpServer())
      .post('/growth/snapshots')
      .set(auth(adminToken))
      .send({ period: 'DAILY' })
      .expect(201);
    expect(daily.body.snapshot.periodType).toBe('DAILY');
    expect(daily.body.snapshot.id).not.toBe(monthlySnapshotId);

    const list = await request(app.getHttpServer())
      .get('/growth/snapshots?period=MONTHLY&limit=10')
      .set(auth(adminToken))
      .expect(200);
    expect(
      list.body.some((row: { id: string }) => row.id === monthlySnapshotId),
    ).toBe(true);
  });

  it('exposes Prometheus gauges, audit records and operator-scoped storage', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/growth/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('growth_tenants');
    expect(metrics.text).toContain('growth_activation_rate_pct');
    expect(metrics.text).toContain('growth_paid_conversion_pct');
    expect(metrics.text).toContain('growth_upsell_rate_pct');

    const audits = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'growth'`,
      [abcTenantId],
    );
    expect(audits[0].total).toBeGreaterThanOrEqual(1);

    const snapshotTenants = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM growth_snapshots`,
    );
    expect(
      snapshotTenants.map((row: { tenant_id: string }) => row.tenant_id),
    ).toEqual([abcTenantId]);

    const experimentTenants = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM growth_experiments`,
    );
    expect(
      experimentTenants.map((row: { tenant_id: string }) => row.tenant_id),
    ).toEqual([abcTenantId]);
  });
});

