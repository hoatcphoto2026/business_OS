/**
 * D6 Executive Dashboard.
 * Requires migration:run and seed. No global prefix, same as D1-D5.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Executive Dashboard (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let cafeTenantId: string;

  const PASSWORD = 'Password123!';
  const stamp = Date.now();
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

    const tenants = await dataSource.query(
      "SELECT id, code FROM tenants WHERE code IN ('ABC', 'CAFE_MOC')",
    );
    abcTenantId = tenants.find((row: { code: string }) => row.code === 'ABC').id;
    cafeTenantId = tenants.find(
      (row: { code: string }) => row.code === 'CAFE_MOC',
    ).id;

    // Force a revenue drop: previous MRR history point far above the current MRR.
    await dataSource.query(
      `INSERT INTO metric_history
         (id, tenant_id, metric_code, value, unit, period_type, recorded_at, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'MRR', 2000000, 'CURRENCY', 'DAILY',
               now() - interval '10 days', '{}'::jsonb, now(), now())`,
      [abcTenantId],
    );

    // Security spike: three open critical events for ABC.
    for (let i = 0; i < 3; i += 1) {
      await dataSource.query(
        `INSERT INTO security_events
           (id, tenant_id, event_type, severity, status, source, detected_at, metadata, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'SUSPICIOUS_ACTIVITY', 'CRITICAL', 'OPEN', 'AUTH', now(), '{}'::jsonb, now(), now())`,
        [abcTenantId],
      );
    }

    // Churn spike: one failed payment per active tenant => all are churn candidates.
    const activeTenants = await dataSource.query(
      `SELECT id FROM tenants WHERE status IN ('active', 'trial')`,
    );
    for (const tenant of activeTenants as Array<{ id: string }>) {
      await dataSource.query(
        `INSERT INTO payment_transactions
           (id, tenant_id, provider, status, amount, currency, idempotency_key, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'BANKING', 'FAILED', 100000, 'VND', $2, now(), now())`,
        [tenant.id, `exec-alert-${stamp}-${tenant.id}`],
      );
    }

    // System risk: a failed onboarding record for the cafe tenant.
    await dataSource.query(
      `INSERT INTO tenant_onboardings
         (id, tenant_id, status, current_step, error_message, retry_count, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'FAILED', 'PROVISION', 'Forced failure for drilldown', 1, '{}'::jsonb, now(), now())`,
      [cafeTenantId],
    );

    // D1 compatibility: the dashboard exposes the latest daily/monthly snapshots.
    await request(app.getHttpServer())
      .post('/executive/snapshots')
      .set(auth(adminToken))
      .send({ period: 'DAILY' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/executive/snapshots')
      .set(auth(adminToken))
      .send({ period: 'MONTHLY' })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous, non-admin and non-operator callers', async () => {
    await request(app.getHttpServer()).get('/executive/widgets').expect(401);
    await request(app.getHttpServer())
      .get('/executive/widgets')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/executive/alerts')
      .set(auth(cafeToken))
      .expect(403);
  });

  it('returns the dashboard superset (D1 metrics + D6 widgets/alerts)', async () => {
    const res = await request(app.getHttpServer())
      .get('/executive/dashboard')
      .set(auth(adminToken))
      .expect(200);

    // D1 fields stay intact.
    expect(res.body.metrics).toHaveLength(12);
    expect(res.body.kpis.mrr).toBeGreaterThan(0);
    expect(res.body.latestMonthly).not.toBeNull();
    expect(Array.isArray(res.body.trends.mrr)).toBe(true);

    // D6 additions.
    expect(res.body.widgets).toHaveLength(7);
    expect(res.body.meta.operatorOnly).toBe(true);
    expect(res.body.meta.role).toEqual(expect.any(String));
    expect(res.body.range.from).toEqual(expect.any(String));
    expect(res.body.range.to).toEqual(expect.any(String));
    expect(Array.isArray(res.body.alerts)).toBe(true);
    const alertTypes = res.body.alerts.map((row: { type: string }) => row.type);
    expect(alertTypes).toEqual(
      expect.arrayContaining([
        'REVENUE_DROP',
        'CHURN_SPIKE',
        'SECURITY_SPIKE',
        'SYSTEM_RISK',
      ]),
    );
    for (const widget of res.body.widgets) {
      expect(widget.status).toMatch(/^(OK|WARNING|CRITICAL)$/);
      expect(widget.drilldown.path).toContain('/executive/widgets/');
    }
  });

  it('filters widgets and exposes status + drill-down links', async () => {
    const all = await request(app.getHttpServer())
      .get('/executive/widgets')
      .set(auth(adminToken))
      .expect(200);
    expect(all.body.widgets).toHaveLength(7);
    const keys = all.body.widgets.map((row: { key: string }) => row.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'REVENUE',
        'GROWTH',
        'CUSTOMERS',
        'COMPLIANCE',
        'SECURITY',
        'AUTOMATION',
        'OPERATIONS',
      ]),
    );

    const filtered = await request(app.getHttpServer())
      .get('/executive/widgets?widgets=REVENUE,SECURITY')
      .set(auth(adminToken))
      .expect(200);
    expect(filtered.body.widgets).toHaveLength(2);
    expect(filtered.body.widgets.map((row: { key: string }) => row.key)).toEqual([
      'REVENUE',
      'SECURITY',
    ]);
    for (const widget of filtered.body.widgets) {
      expect(widget.primary.value).toEqual(expect.any(Number));
      expect(Array.isArray(widget.secondary)).toBe(true);
      expect(widget.drilldown.query.from).toEqual(expect.any(String));
    }
  });

  it('returns executive alerts and filters by severity/type', async () => {
    const all = await request(app.getHttpServer())
      .get('/executive/alerts')
      .set(auth(adminToken))
      .expect(200);
    expect(all.body.total).toBeGreaterThanOrEqual(4);
    for (const alert of all.body.alerts) {
      expect(alert.id).toEqual(expect.any(String));
      expect(alert.message).toEqual(expect.any(String));
      expect(alert.threshold).toEqual(expect.any(Number));
      expect(alert.drilldown.path).toEqual(expect.any(String));
    }

    const critical = await request(app.getHttpServer())
      .get('/executive/alerts?severity=CRITICAL')
      .set(auth(adminToken))
      .expect(200);
    expect(critical.body.alerts.length).toBeGreaterThanOrEqual(1);
    expect(
      critical.body.alerts.every(
        (row: { severity: string }) => row.severity === 'CRITICAL',
      ),
    ).toBe(true);

    const security = await request(app.getHttpServer())
      .get('/executive/alerts?type=SECURITY_SPIKE')
      .set(auth(adminToken))
      .expect(200);
    expect(security.body.total).toBe(1);
    expect(security.body.alerts[0].type).toBe('SECURITY_SPIKE');
    expect(security.body.alerts[0].value).toBeGreaterThanOrEqual(3);
  });

  it('supports date ranges and rejects inverted ranges', async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date().toISOString();
    const ranged = await request(app.getHttpServer())
      .get(`/executive/alerts?from=${from}&to=${to}`)
      .set(auth(adminToken))
      .expect(200);
    expect(ranged.body.range.from).toBe(from);
    expect(ranged.body.range.to).toBe(to);

    await request(app.getHttpServer())
      .get(`/executive/widgets?from=${to}&to=${from}`)
      .set(auth(adminToken))
      .expect(400);
    await request(app.getHttpServer())
      .get('/executive/alerts?from=not-a-date')
      .set(auth(adminToken))
      .expect(400);
  });


  it('drills into revenue and customer widgets', async () => {
    const revenue = await request(app.getHttpServer())
      .get('/executive/widgets/REVENUE')
      .set(auth(adminToken))
      .expect(200);
    expect(revenue.body.widget.key).toBe('REVENUE');
    expect(revenue.body.details.summary.mrr).toBeGreaterThan(0);
    expect(Array.isArray(revenue.body.details.segments.byPlan)).toBe(true);
    expect(Array.isArray(revenue.body.details.segments.byTenant)).toBe(true);
    expect(revenue.body.details.mrrGrowthPct).toBeLessThan(0);
    expect(revenue.body.details.topCustomers.length).toBeGreaterThanOrEqual(1);

    const customers = await request(app.getHttpServer())
      .get('/executive/widgets/CUSTOMERS')
      .set(auth(adminToken))
      .expect(200);
    expect(customers.body.details.totals.tenants).toBeGreaterThanOrEqual(2);
    expect(customers.body.details.churnCandidates.length).toBeGreaterThanOrEqual(1);
    expect(customers.body.details.churnCandidates[0].churnCandidate).toBe(true);
  });

  it('drills into security, compliance and operations widgets', async () => {
    const security = await request(app.getHttpServer())
      .get('/executive/widgets/SECURITY')
      .set(auth(adminToken))
      .expect(200);
    expect(security.body.details.events.length).toBeGreaterThanOrEqual(3);
    expect(security.body.details.events[0].severity).toEqual(expect.any(String));

    const compliance = await request(app.getHttpServer())
      .get('/executive/widgets/COMPLIANCE')
      .set(auth(adminToken))
      .expect(200);
    expect(compliance.body.details.evidence).toEqual(
      expect.objectContaining({ total: expect.any(Number) }),
    );
    expect(Array.isArray(compliance.body.details.openRisks)).toBe(true);

    const operations = await request(app.getHttpServer())
      .get('/executive/widgets/OPERATIONS')
      .set(auth(adminToken))
      .expect(200);
    expect(Array.isArray(operations.body.details.pastDueSubscriptions)).toBe(true);
    expect(operations.body.details.failedOnboardings.length).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .get('/executive/widgets/NOPE')
      .set(auth(adminToken))
      .expect(404);
  });

  it('keeps the D1 executive endpoints working', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/executive/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.body.metrics).toHaveLength(12);
    expect(metrics.body.summary.mrr).toBeGreaterThan(0);

    const history = await request(app.getHttpServer())
      .get('/executive/metrics/history?code=MRR&period=DAILY')
      .set(auth(adminToken))
      .expect(200);
    expect(history.body.series.length).toBeGreaterThanOrEqual(1);

    const snapshots = await request(app.getHttpServer())
      .get('/executive/snapshots?limit=5')
      .set(auth(adminToken))
      .expect(200);
    expect(Array.isArray(snapshots.body)).toBe(true);
  });
});

