/**
 * D4 Product Analytics.
 * Requires migration:run and seed. No global prefix, same as C5/C6/C7/D1-D3.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Product Analytics (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let organizationId: string;
  let departmentId: string;

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

    const organization = await request(app.getHttpServer())
      .post('/org/organizations')
      .set(auth(adminToken))
      .send({ code: `PA-ORG-${stamp}`, name: 'Product Analytics Org' })
      .expect(201);
    organizationId = organization.body.id;
    const department = await request(app.getHttpServer())
      .post('/org/departments')
      .set(auth(adminToken))
      .send({
        organizationId,
        code: `PA-DEPT-${stamp}`,
        name: 'Product Analytics Department',
      })
      .expect(201);
    departmentId = department.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous, non-admin and non-operator callers', async () => {
    await request(app.getHttpServer()).get('/analytics/features').expect(401);
    await request(app.getHttpServer())
      .get('/analytics/features')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/analytics/features')
      .set(auth(cafeToken))
      .expect(403);
  });

  it('exposes the feature catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/analytics/features/catalog')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body).toHaveLength(11);
    const keys = res.body.map((row: { key: string }) => row.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'SALES_ORDERS',
        'INVOICES',
        'CUSTOMERS',
        'REPORTS',
        'SECURITY',
        'SCIM',
        'API_KEYS',
      ]),
    );
    for (const feature of res.body) {
      expect(feature.label).toEqual(expect.any(String));
      expect(feature.description).toEqual(expect.any(String));
    }
  });

  it('derives feature usage and returns the ranking', async () => {
    const collected = await request(app.getHttpServer())
      .post('/analytics/features/collect?days=30')
      .set(auth(adminToken))
      .expect(200);
    expect(collected.body.days).toBe(30);
    expect(collected.body.inserted).toBeGreaterThanOrEqual(1);

    const ranking = await request(app.getHttpServer())
      .get('/analytics/features?days=30')
      .set(auth(adminToken))
      .expect(200);
    expect(ranking.body.totals.features).toBe(11);
    expect(ranking.body.totals.activeFeatures).toBeGreaterThanOrEqual(1);
    expect(ranking.body.totals.usage).toBeGreaterThanOrEqual(1);
    expect(ranking.body.totalActiveTenants).toBeGreaterThanOrEqual(2);
    expect(ranking.body.mostUsed).toHaveLength(5);
    expect(ranking.body.leastUsed).toHaveLength(5);
    expect(ranking.body.mostUsed[0].usageCount).toBeGreaterThanOrEqual(1);
    for (const feature of ranking.body.features) {
      expect(feature.activationPct).toBeGreaterThanOrEqual(0);
      expect(feature.activationPct).toBeLessThanOrEqual(100);
      expect(typeof feature.retentionPct).toBe('number');
      expect(typeof feature.growthPct).toBe('number');
    }
  });

  it('tracks explicit feature usage with organization/department dimensions', async () => {
    const tracked = await request(app.getHttpServer())
      .post('/analytics/features/track')
      .set(auth(adminToken))
      .send({
        featureKey: 'REPORTS',
        quantity: 5,
        organizationId,
        departmentId,
        metadata: { source: 'e2e' },
      })
      .expect(201);
    expect(tracked.body.featureKey).toBe('REPORTS');
    expect(tracked.body.quantity).toBe(5);
    expect(tracked.body.organizationId).toBe(organizationId);
    expect(tracked.body.departmentId).toBe(departmentId);

    const ranking = await request(app.getHttpServer())
      .get('/analytics/features')
      .set(auth(adminToken))
      .expect(200);
    const reports = ranking.body.features.find(
      (row: { featureKey: string }) => row.featureKey === 'REPORTS',
    );
    expect(reports.usageCount).toBeGreaterThanOrEqual(5);
  });

  it('builds adoption by tenant and plan', async () => {
    const byTenant = await request(app.getHttpServer())
      .get(`/analytics/adoption?dimension=TENANT&period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    expect(byTenant.body.dimension).toBe('TENANT');
    expect(byTenant.body.period).toBe(period);
    expect(byTenant.body.features).toHaveLength(11);

    const sales = byTenant.body.features.find(
      (row: { featureKey: string }) => row.featureKey === 'SALES_ORDERS',
    );
    expect(sales.totalUsage).toBeGreaterThanOrEqual(1);
    const abcRow = sales.rows.find(
      (row: { key: string }) => row.key === abcTenantId,
    );
    expect(abcRow).toBeDefined();
    expect(abcRow.usageCount).toBeGreaterThanOrEqual(1);
    expect(abcRow.adoptionPct).toBeGreaterThan(0);

    const byPlan = await request(app.getHttpServer())
      .get(`/analytics/adoption?dimension=PLAN&period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    const allPlanKeys = byPlan.body.features.flatMap(
      (feature: { rows: Array<{ key: string }> }) =>
        feature.rows.map((row) => row.key),
    );
    expect(allPlanKeys).toEqual(
      expect.arrayContaining(['professional']),
    );
  });

  it('builds adoption by organization and department', async () => {
    const byOrg = await request(app.getHttpServer())
      .get(`/analytics/adoption?dimension=ORGANIZATION&period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    const reports = byOrg.body.features.find(
      (row: { featureKey: string }) => row.featureKey === 'REPORTS',
    );
    const orgRow = reports.rows.find(
      (row: { key: string }) => row.key === organizationId,
    );
    expect(orgRow).toBeDefined();
    expect(orgRow.label).toBe('Product Analytics Org');
    expect(orgRow.usageCount).toBeGreaterThanOrEqual(5);

    const byDept = await request(app.getHttpServer())
      .get(`/analytics/adoption?dimension=DEPARTMENT&period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    const deptReports = byDept.body.features.find(
      (row: { featureKey: string }) => row.featureKey === 'REPORTS',
    );
    const deptRow = deptReports.rows.find(
      (row: { key: string }) => row.key === departmentId,
    );
    expect(deptRow).toBeDefined();
    expect(deptRow.label).toBe('Product Analytics Department');

    await request(app.getHttpServer())
      .get('/analytics/adoption?dimension=TENANT&period=2026-1')
      .set(auth(adminToken))
      .expect(400);
  });

  it('returns daily feature trends with growth and retention', async () => {
    const res = await request(app.getHttpServer())
      .get('/analytics/trends?days=30&feature=REPORTS')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.series).toHaveLength(1);
    expect(res.body.series[0].featureKey).toBe('REPORTS');
    expect(res.body.series[0].points.length).toBeGreaterThanOrEqual(1);
    const latest =
      res.body.series[0].points[res.body.series[0].points.length - 1];
    expect(latest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(latest.usageCount).toBeGreaterThanOrEqual(5);
    expect(latest.activeTenants).toBeGreaterThanOrEqual(1);
    expect(typeof latest.growthPct).toBe('number');
    expect(
      latest.retentionPct === null || typeof latest.retentionPct === 'number',
    ).toBe(true);
  });

  it('exposes Prometheus gauges and stores operator-scoped reports', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/analytics/features/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('product_analytics_features');
    expect(metrics.text).toContain('product_analytics_active_features');
    expect(metrics.text).toContain('product_analytics_usage_30d');

    const audits = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'product_analytics'`,
      [abcTenantId],
    );
    expect(audits[0].total).toBeGreaterThanOrEqual(1);

    const adoptionTenants = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM feature_adoption`,
    );
    expect(
      adoptionTenants.map((row: { tenant_id: string }) => row.tenant_id),
    ).toEqual([abcTenantId]);

    const trendTenants = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM feature_trends`,
    );
    expect(trendTenants.map((row: { tenant_id: string }) => row.tenant_id)).toEqual([
      abcTenantId,
    ]);
    const trendRows = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM feature_trends WHERE tenant_id = $1`,
      [abcTenantId],
    );
    expect(trendRows[0].total).toBeGreaterThanOrEqual(1);
  });
});

