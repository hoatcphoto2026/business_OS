/**
 * D3 Customer Health Platform.
 * Requires migration:run and seed. No global prefix, same as C5/C6/C7/D1/D2.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Customer Health (e2e)', () => {
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

    const owners = await dataSource.query(
      "SELECT id FROM users WHERE email = 'owner@cafemoc.vn' LIMIT 1",
    );
    const ownerId = owners[0].id as string;

    // Deterministic unhealthy signals for CAFE_MOC.
    for (let i = 0; i < 4; i += 1) {
      await dataSource.query(
        `INSERT INTO payment_transactions
           (id, tenant_id, provider, status, amount, currency, idempotency_key, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'BANKING', 'FAILED', 100000, 'VND', $2, now(), now())`,
        [cafeTenantId, `health-fail-${stamp}-${i}`],
      );
    }
    for (let i = 0; i < 3; i += 1) {
      await dataSource.query(
        `INSERT INTO security_events
           (id, tenant_id, event_type, severity, status, source, detected_at, metadata, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'FAILED_LOGIN', 'HIGH', 'OPEN', 'AUTH', now(), '{}'::jsonb, now(), now())`,
        [cafeTenantId],
      );
    }
    for (let i = 0; i < 5; i += 1) {
      await dataSource.query(
        `INSERT INTO support_tickets
           (id, tenant_id, subject, description, status, priority, requester_id, metadata, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'Health drill ticket', 'OPEN', 'HIGH', $3, '{}'::jsonb, now(), now())`,
        [cafeTenantId, `Health drill ${stamp}-${i}`, ownerId],
      );
    }
    expect(abcTenantId).toEqual(expect.any(String));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous/non-operator callers but keeps /health as liveness', async () => {
    await request(app.getHttpServer()).get('/customer-health').expect(401);
    await request(app.getHttpServer())
      .get('/customer-health')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/customer-health')
      .set(auth(cafeToken))
      .expect(403);

    const liveness = await request(app.getHttpServer()).get('/health').expect(200);
    expect(liveness.body.status).toBe('ok');
  });

  it('returns the health dashboard with distribution and scores', async () => {
    const res = await request(app.getHttpServer())
      .get('/customer-health')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.totals.tenants).toBeGreaterThanOrEqual(2);
    expect(res.body.totals.averageScore).toBeGreaterThanOrEqual(0);
    expect(res.body.totals.averageScore).toBeLessThanOrEqual(100);
    const distributionSum =
      res.body.distribution.HEALTHY +
      res.body.distribution.WARNING +
      res.body.distribution.AT_RISK +
      res.body.distribution.CRITICAL;
    expect(distributionSum).toBe(res.body.totals.tenants);
    expect(res.body.totals.churnCandidates).toBeGreaterThanOrEqual(1);
    expect(res.body.tenants[0].signals).toHaveLength(7);
    for (const tenant of res.body.tenants) {
      expect(tenant.score).toBeGreaterThanOrEqual(0);
      expect(tenant.score).toBeLessThanOrEqual(100);
      expect(['HEALTHY', 'WARNING', 'AT_RISK', 'CRITICAL']).toContain(
        tenant.level,
      );
    }
  });

  it('lists at-risk tenants with risk drivers and churn flags', async () => {
    const res = await request(app.getHttpServer())
      .get('/customer-health/at-risk')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const cafe = res.body.tenants.find(
      (row: { targetTenantCode: string }) => row.targetTenantCode === 'CAFE_MOC',
    );
    expect(cafe).toBeDefined();
    expect(cafe.score).toBeLessThan(80);
    expect(cafe.churnCandidate).toBe(true);
    expect(cafe.riskDrivers.length).toBeGreaterThanOrEqual(1);
    expect(cafe.riskDrivers.map((row: { code: string }) => row.code)).toEqual(
      expect.arrayContaining(['FAILED_PAYMENTS']),
    );
    expect(cafe.primaryRisk).toEqual(expect.any(String));

    const churnOnly = await request(app.getHttpServer())
      .get('/customer-health/at-risk?churnOnly=true')
      .set(auth(adminToken))
      .expect(200);
    expect(
      churnOnly.body.tenants.every(
        (row: { churnCandidate: boolean }) => row.churnCandidate === true,
      ),
    ).toBe(true);
    expect(
      churnOnly.body.tenants.some(
        (row: { targetTenantCode: string }) =>
          row.targetTenantCode === 'CAFE_MOC',
      ),
    ).toBe(true);
  });


  it('returns tenant health detail with signals and history', async () => {
    const cafe = await request(app.getHttpServer())
      .get(`/customer-health/tenant/${cafeTenantId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(cafe.body.targetTenantCode).toBe('CAFE_MOC');
    expect(cafe.body.score).toBeLessThan(80);
    expect(cafe.body.signals).toHaveLength(7);
    expect(cafe.body.metrics.failedPayments).toBeGreaterThanOrEqual(4);
    expect(cafe.body.riskDrivers.map((row: { code: string }) => row.code)).toEqual(
      expect.arrayContaining([
        'FAILED_PAYMENTS',
        'SECURITY_EVENTS',
        'SUPPORT_TICKETS',
      ]),
    );
    expect(Array.isArray(cafe.body.history)).toBe(true);

    const abc = await request(app.getHttpServer())
      .get(`/customer-health/tenant/${abcTenantId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(abc.body.targetTenantCode).toBe('ABC');
    expect(abc.body.score).toBeGreaterThanOrEqual(0);
    expect(abc.body.score).toBeLessThanOrEqual(100);
    expect(abc.body.signals).toHaveLength(7);

    await request(app.getHttpServer())
      .get('/customer-health/tenant/00000000-0000-4000-8000-000000000000')
      .set(auth(adminToken))
      .expect(404);
  });

  it('exposes the signal catalog with weights summing to 100', async () => {
    const res = await request(app.getHttpServer())
      .get('/customer-health/signals')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body).toHaveLength(7);
    const totalWeight = res.body.reduce(
      (sum: number, row: { weight: string | number }) => sum + Number(row.weight),
      0,
    );
    expect(totalWeight).toBeCloseTo(100, 2);
    expect(res.body.map((row: { code: string }) => row.code)).toEqual(
      expect.arrayContaining([
        'LOGIN_FREQUENCY',
        'ACTIVE_USERS',
        'USAGE_TREND',
        'SUPPORT_TICKETS',
        'FAILED_PAYMENTS',
        'RENEWAL_SUCCESS',
        'SECURITY_EVENTS',
      ]),
    );
  });

  it('generates idempotent daily snapshots and score history', async () => {
    const first = await request(app.getHttpServer())
      .post('/customer-health/snapshots')
      .set(auth(adminToken))
      .send({})
      .expect(201);
    expect(first.body.tenants).toBeGreaterThanOrEqual(2);
    expect(first.body.averageScore).toBeGreaterThanOrEqual(0);
    expect(first.body.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.body.churnCandidates).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .post('/customer-health/snapshots')
      .set(auth(adminToken))
      .send({})
      .expect(201);

    const snapshotRows = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM health_snapshots
        WHERE tenant_id = $1 AND snapshot_date = CURRENT_DATE`,
      [abcTenantId],
    );
    expect(snapshotRows[0].total).toBe(first.body.tenants);

    const scoreRows = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM customer_health_scores WHERE tenant_id = $1`,
      [abcTenantId],
    );
    expect(scoreRows[0].total).toBe(first.body.tenants);

    const trend = await request(app.getHttpServer())
      .get(`/customer-health/trends?tenantId=${cafeTenantId}&days=30`)
      .set(auth(adminToken))
      .expect(200);
    expect(trend.body.series).toHaveLength(1);
    expect(trend.body.series[0].targetTenantId).toBe(cafeTenantId);
    expect(trend.body.series[0].points.length).toBeGreaterThanOrEqual(1);
    expect(trend.body.series[0].points[0].score).toBeLessThan(80);
  });

  it('serves the /health/* aliases without breaking probes', async () => {
    const dashboard = await request(app.getHttpServer())
      .get('/health/dashboard')
      .set(auth(adminToken))
      .expect(200);
    expect(dashboard.body.totals.tenants).toBeGreaterThanOrEqual(2);

    await request(app.getHttpServer())
      .get('/health/at-risk')
      .set(auth(adminToken))
      .expect(200);

    const tenant = await request(app.getHttpServer())
      .get(`/health/tenant/${cafeTenantId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(tenant.body.targetTenantCode).toBe('CAFE_MOC');

    const ready = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ready');
  });

  it('exposes Prometheus gauges and audit records', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/customer-health/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('customer_health_avg_score');
    expect(metrics.text).toContain('customer_health_at_risk_tenants');
    expect(metrics.text).toContain('customer_health_churn_candidates');

    const audits = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'customer_health_snapshot'`,
      [abcTenantId],
    );
    expect(audits[0].total).toBeGreaterThanOrEqual(1);
  });
});

