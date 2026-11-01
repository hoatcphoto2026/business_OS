/**
 * D8 Analytics Warehouse Layer.
 * Seeds deterministic source rows for 2 days, runs the ETL, and removes the
 * source rows afterwards (facts stay in the warehouse; DB is isolated).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Analytics Warehouse (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let cafeTenantId: string;
  let adminUserId: string;
  let today: string;
  let day1: string;
  let day2: string;
  let tenantCount: number;
  let snapshotId: string;

  const PASSWORD = 'Password123!';
  const stamp = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const cleanup = async () => {
    await dataSource.query(
      `DELETE FROM billing_invoices WHERE invoice_number LIKE 'WH-E2E-%'`,
    );
    await dataSource.query(
      `DELETE FROM usage_records WHERE metadata->>'source' = 'warehouse-e2e'`,
    );
    await dataSource.query(
      `DELETE FROM support_tickets WHERE subject LIKE 'WH-E2E%'`,
    );
    await dataSource.query(
      `DELETE FROM compliance_evidence WHERE code LIKE 'WH-E2E-%'`,
    );
    await dataSource.query(
      `DELETE FROM compliance_risks WHERE title LIKE 'WH-E2E%'`,
    );
    await dataSource.query(
      `DELETE FROM security_events WHERE dedupe_key LIKE 'WH-E2E-%'`,
    );
    await dataSource.query(
      `DELETE FROM security_login_attempts WHERE email LIKE 'wh-e2e-%'`,
    );
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

    const [dates] = await dataSource.query(
      `SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today,
              to_char(CURRENT_DATE - 1, 'YYYY-MM-DD') AS day1,
              to_char(CURRENT_DATE - 2, 'YYYY-MM-DD') AS day2`,
    );
    today = dates.today;
    day1 = dates.day1;
    day2 = dates.day2;

    const [tenantTotal] = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM tenants`,
    );
    tenantCount = tenantTotal.total;

    await cleanup();

    await dataSource.query(
      `INSERT INTO billing_invoices
         (id, tenant_id, invoice_number, status, currency, subtotal, tax_rate,
          tax_amount, discount_amount, total, amount_paid, issued_at, paid_at,
          created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2 || '-D2', 'PAID', 'VND', 300000, 0, 0, 0,
          300000, 300000, $3::date + time '10:00', $3::date + time '10:00',
          now(), now()),
         (gen_random_uuid(), $1, $2 || '-D1', 'PAID', 'VND', 500000, 0, 0, 0,
          500000, 500000, $4::date + time '10:00', $4::date + time '10:00',
          now(), now())`,
      [abcTenantId, `WH-E2E-${stamp}`, day2, day1],
    );

    await dataSource.query(
      `INSERT INTO usage_records
         (id, tenant_id, metric, quantity, recorded_at, metadata, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, 'AI_REQUESTS', 40, $2::date + time '09:00',
          '{"source":"warehouse-e2e"}'::jsonb, now(), now()),
         (gen_random_uuid(), $1, 'AI_REQUESTS', 60, $3::date + time '09:00',
          '{"source":"warehouse-e2e"}'::jsonb, now(), now())`,
      [abcTenantId, day2, day1],
    );

    await dataSource.query(
      `INSERT INTO login_histories (id, tenant_id, user_id, login_at, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3::date + time '08:00', now()),
         (gen_random_uuid(), $1, $2, $3::date + time '15:00', now())`,
      [abcTenantId, adminUserId, day1],
    );

    await dataSource.query(
      `INSERT INTO support_tickets
         (id, tenant_id, subject, description, status, priority, requester_id,
          metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'warehouse seed', 'OPEN', 'LOW', $3,
               '{"source":"warehouse-e2e"}'::jsonb, $4::date + time '11:00', now())`,
      [abcTenantId, `WH-E2E ticket ${stamp}`, adminUserId, day1],
    );

    await dataSource.query(
      `INSERT INTO compliance_evidence
         (id, tenant_id, code, title, category, source, status, collected_at,
          hash, payload, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Warehouse evidence', 'SECURITY',
               'MANUAL', 'VERIFIED', $3::date + time '09:00', repeat('a', 64),
               '{}'::jsonb, $3::date + time '09:00', now())`,
      [abcTenantId, `WH-E2E-EV-${stamp}`, day2],
    );

    await dataSource.query(
      `INSERT INTO compliance_risks
         (id, tenant_id, title, category, description, severity, status,
          likelihood, impact, score, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'SECURITY', 'warehouse seed',
               'CRITICAL', 'OPEN', 5, 5, 25, $3::date + time '09:00', now())`,
      [abcTenantId, `WH-E2E risk ${stamp}`, day2],
    );

    await dataSource.query(
      `INSERT INTO security_events
         (id, tenant_id, event_type, severity, status, source, dedupe_key,
          detected_at, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'SUSPICIOUS_ACTIVITY', 'CRITICAL', 'OPEN',
               'AUTH', $2, $3::date + time '12:00', '{}'::jsonb, now(), now())`,
      [abcTenantId, `WH-E2E-SEC-${stamp}`, day1],
    );

    await dataSource.query(
      `INSERT INTO security_login_attempts
         (id, tenant_id, email, success, reason, created_at)
       VALUES (gen_random_uuid(), $1, $2, false, 'BAD_PASSWORD',
               $3::date + time '12:30')`,
      [abcTenantId, `wh-e2e-${stamp}@example.com`, day1],
    );
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  it('rejects anonymous, non-admin and non-operator callers', async () => {
    await request(app.getHttpServer()).get('/warehouse').expect(401);
    await request(app.getHttpServer())
      .get('/warehouse/facts?fact=REVENUE')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/warehouse/etl')
      .set(auth(cafeToken))
      .send({})
      .expect(403);
  });

  it('runs the daily ETL for the requested window', async () => {
    const res = await request(app.getHttpServer())
      .post('/warehouse/etl')
      .set(auth(adminToken))
      .send({ from: day2, to: today, refreshDimensions: true })
      .expect(201);

    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.from).toBe(day2);
    expect(res.body.to).toBe(today);
    expect(res.body.facts.revenue).toBe(tenantCount * 3); // all tenants × 3 days
    expect(res.body.facts.customer).toBe(tenantCount * 3);
    expect(res.body.facts.compliance).toBe(tenantCount * 3);
    expect(res.body.facts.security).toBe(tenantCount * 3);
    expect(res.body.facts.usage).toBe(2); // ABC on day-2 and day-1 only
    expect(res.body.dimensions.dates).toBeGreaterThanOrEqual(365);
    expect(res.body.dimensions.tenants).toBe(tenantCount);
    expect(res.body.dimensions.plans).toBeGreaterThanOrEqual(4);
  });

  it('is idempotent when the same window is re-run', async () => {
    const res = await request(app.getHttpServer())
      .post('/warehouse/etl')
      .set(auth(adminToken))
      .send({ from: day2, to: today, refreshDimensions: false })
      .expect(201);
    expect(res.body.facts.revenue).toBe(tenantCount * 3);

    const [row] = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM fact_revenue
        WHERE tenant_id = $1 AND source_tenant_id = $1
          AND fact_date BETWEEN $2 AND $3`,
      [abcTenantId, day2, today],
    );
    expect(row.total).toBe(3);
  });

  it('stores the expected revenue, usage, compliance and security facts', async () => {
    const common = `from=${day2}&to=${today}`;

    const revenue = await request(app.getHttpServer())
      .get(`/warehouse/facts?fact=REVENUE&sourceTenantId=${abcTenantId}&${common}`)
      .set(auth(adminToken))
      .expect(200);
    expect(revenue.body.total).toBe(3);
    const d1 = revenue.body.items.find(
      (row: { factDate: string }) => row.factDate === day1,
    );
    expect(Number(d1.revenueAmount)).toBe(500000);
    expect(d1.invoiceCount).toBe(1);
    expect(Number(d1.mrr)).toBeGreaterThan(0);

    const usage = await request(app.getHttpServer())
      .get(`/warehouse/facts?fact=USAGE&metric=AI_REQUESTS&${common}`)
      .set(auth(adminToken))
      .expect(200);
    expect(usage.body.total).toBe(2);
    expect(
      usage.body.items.map((row: { quantity: string }) => Number(row.quantity)).sort(),
    ).toEqual([40, 60]);

    const compliance = await request(app.getHttpServer())
      .get(`/warehouse/facts?fact=COMPLIANCE&sourceTenantId=${abcTenantId}&${common}`)
      .set(auth(adminToken))
      .expect(200);
    const compD1 = compliance.body.items.find(
      (row: { factDate: string }) => row.factDate === day1,
    );
    expect(compD1.evidenceTotal).toBeGreaterThanOrEqual(1);
    expect(compD1.evidenceVerified).toBeGreaterThanOrEqual(1);
    expect(compD1.criticalRisks).toBeGreaterThanOrEqual(0);
    expect(Number(compD1.complianceScore)).toBeGreaterThanOrEqual(0);
    expect(Number(compD1.complianceScore)).toBeLessThanOrEqual(100);

    const security = await request(app.getHttpServer())
      .get(`/warehouse/facts?fact=SECURITY&sourceTenantId=${abcTenantId}&${common}`)
      .set(auth(adminToken))
      .expect(200);
    const secD1 = security.body.items.find(
      (row: { factDate: string }) => row.factDate === day1,
    );
    expect(secD1.securityEvents).toBeGreaterThanOrEqual(1);
    expect(secD1.criticalEvents).toBeGreaterThanOrEqual(1);
    expect(secD1.failedLogins).toBeGreaterThanOrEqual(1);
    expect(Number(secD1.riskScore)).toBeGreaterThan(0);

    const customer = await request(app.getHttpServer())
      .get(`/warehouse/facts?fact=CUSTOMER&sourceTenantId=${abcTenantId}&${common}`)
      .set(auth(adminToken))
      .expect(200);
    const cusD1 = customer.body.items.find(
      (row: { factDate: string }) => row.factDate === day1,
    );
    expect(cusD1.activeUsers).toBeGreaterThanOrEqual(1);
    expect(cusD1.loginCount).toBeGreaterThanOrEqual(2);
    expect(cusD1.ticketsOpened).toBeGreaterThanOrEqual(1);
  });

  it('validates fact filters', async () => {
    await request(app.getHttpServer())
      .get('/warehouse/facts?fact=NOPE')
      .set(auth(adminToken))
      .expect(400);
    await request(app.getHttpServer())
      .get(`/warehouse/facts?fact=REVENUE&from=${today}&to=${day2}`)
      .set(auth(adminToken))
      .expect(400);

    const byPlan = await request(app.getHttpServer())
      .get('/warehouse/facts?fact=REVENUE&planCode=professional')
      .set(auth(adminToken))
      .expect(200);
    expect(byPlan.body.total).toBeGreaterThanOrEqual(3);
    expect(
      byPlan.body.items.every(
        (row: { planCode: string }) => row.planCode === 'professional',
      ),
    ).toBe(true);

    const limited = await request(app.getHttpServer())
      .get('/warehouse/facts?fact=CUSTOMER&limit=1')
      .set(auth(adminToken))
      .expect(200);
    expect(limited.body.items).toHaveLength(1);
  });


  it('serves the warehouse overview for dashboards', async () => {
    const res = await request(app.getHttpServer())
      .get('/warehouse')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.totals.revenue).toBeGreaterThanOrEqual(800000);
    expect(res.body.totals.tenants).toBeGreaterThanOrEqual(2);
    expect(res.body.totals.securityEvents).toBeGreaterThanOrEqual(1);
    expect(res.body.dimensions.plans).toBeGreaterThanOrEqual(4);
    expect(res.body.trends.revenue).toHaveLength(30);
    expect(res.body.trends.usage).toHaveLength(30);
  });

  it('computes daily trend series with summary', async () => {
    const revenue = await request(app.getHttpServer())
      .get('/warehouse/trends?metric=REVENUE&days=7')
      .set(auth(adminToken))
      .expect(200);
    expect(revenue.body.points).toHaveLength(7);
    expect(revenue.body.summary.total).toBeGreaterThanOrEqual(800000);
    expect(revenue.body.summary.changePct).toEqual(expect.any(Number));

    const users = await request(app.getHttpServer())
      .get('/warehouse/trends?metric=ACTIVE_USERS&days=7')
      .set(auth(adminToken))
      .expect(200);
    expect(users.body.points).toHaveLength(7);

    const compliance = await request(app.getHttpServer())
      .get('/warehouse/trends?metric=COMPLIANCE_SCORE&days=7')
      .set(auth(adminToken))
      .expect(200);
    expect(compliance.body.summary.max).toBeLessThanOrEqual(100);

    await request(app.getHttpServer())
      .get('/warehouse/trends?metric=NOPE')
      .set(auth(adminToken))
      .expect(400);
    await request(app.getHttpServer())
      .get('/warehouse/trends?metric=REVENUE&days=0')
      .set(auth(adminToken))
      .expect(400);
  });

  it('generates idempotent daily and monthly snapshots', async () => {
    const daily = await request(app.getHttpServer())
      .post('/warehouse/snapshots')
      .set(auth(adminToken))
      .send({ period: 'DAILY', date: day1 })
      .expect(201);
    snapshotId = daily.body.snapshot.id;
    expect(daily.body.snapshot.snapshotDate).toBe(day1);
    expect(daily.body.snapshot.metrics.revenue).toBe(500000);
    expect(daily.body.snapshot.metrics.securityEvents).toBeGreaterThanOrEqual(1);
    expect(daily.body.snapshot.metrics.complianceScore).toBeGreaterThanOrEqual(0);
    expect(daily.body.snapshot.metrics.complianceScore).toBeLessThanOrEqual(100);
    expect(daily.body.snapshot.tenants).toBeGreaterThanOrEqual(1);

    const again = await request(app.getHttpServer())
      .post('/warehouse/snapshots')
      .set(auth(adminToken))
      .send({ period: 'DAILY', date: day1 })
      .expect(201);
    expect(again.body.snapshot.id).toBe(snapshotId);

    const monthly = await request(app.getHttpServer())
      .post('/warehouse/snapshots')
      .set(auth(adminToken))
      .send({ period: 'MONTHLY', date: day1 })
      .expect(201);
    expect(monthly.body.range.start.slice(0, 7)).toBe(day1.slice(0, 7));
    expect(monthly.body.snapshot.metrics.revenue).toBeGreaterThanOrEqual(800000);

    const list = await request(app.getHttpServer())
      .get('/warehouse/snapshots?limit=10')
      .set(auth(adminToken))
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((row: { id: string }) => row.id === snapshotId)).toBe(true);
    const filtered = await request(app.getHttpServer())
      .get('/warehouse/snapshots?period=MONTHLY')
      .set(auth(adminToken))
      .expect(200);
    expect(
      filtered.body.every(
        (row: { periodType: string }) => row.periodType === 'MONTHLY',
      ),
    ).toBe(true);
  });

  it('exposes the dimension catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/warehouse/dimensions')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.dates.count).toBeGreaterThanOrEqual(365);
    expect(res.body.dates.minDate).toEqual(expect.any(String));
    expect(res.body.tenants.some((row: { code: string }) => row.code === 'ABC')).toBe(
      true,
    );
    expect(res.body.plans.length).toBeGreaterThanOrEqual(4);
    expect(res.body.organizations.count).toBeGreaterThanOrEqual(0);
    expect(res.body.departments.count).toBeGreaterThanOrEqual(0);
  });

  it('exposes Prometheus metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/warehouse/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('warehouse_etl_runs_total');
    expect(res.text).toContain('warehouse_fact_rows_total');
    expect(res.text).toContain('warehouse_fact_rows');
    expect(res.text).toContain('warehouse_snapshots_total');
    expect(res.text).toContain('warehouse_revenue_30d');
  });

  it('keeps facts under the operator tenant and writes an audit trail', async () => {
    const owners = await dataSource.query(
      `SELECT DISTINCT tenant_id FROM fact_revenue`,
    );
    expect(owners.map((row: { tenant_id: string }) => row.tenant_id)).toEqual([
      abcTenantId,
    ]);
    expect(owners[0].tenant_id).not.toBe(cafeTenantId);

    const etlAudit = await dataSource.query(
      `SELECT action FROM audit_logs
        WHERE entity_type = 'warehouse_etl' AND entity_id = $1`,
      [abcTenantId],
    );
    expect(etlAudit.length).toBeGreaterThanOrEqual(1);

    const snapshotAudit = await dataSource.query(
      `SELECT action FROM audit_logs
        WHERE entity_type = 'warehouse_snapshot' AND entity_id = $1`,
      [snapshotId],
    );
    expect(snapshotAudit.length).toBeGreaterThanOrEqual(1);
    expect(snapshotAudit[0].action).toBe('CREATE');
  });
});

