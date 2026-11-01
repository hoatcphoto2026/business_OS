/**
 * C7 Enterprise Reporting Platform.
 * Requires migration:run and seed. No global prefix, same as C5/C6.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Enterprise Reporting (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let departmentCode: string;
  let scheduleId: string;
  let runId: string;
  let webhookId: string;

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
      "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
    );
    abcTenantId = tenants[0].id as string;

    // Deterministic data for the department + usage reports.
    departmentCode = `RPT-${stamp}`;
    const organization = await request(app.getHttpServer())
      .post('/org/organizations')
      .set(auth(adminToken))
      .send({ code: `RPT-ORG-${stamp}`, name: 'Reporting Org' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/org/departments')
      .set(auth(adminToken))
      .send({
        organizationId: organization.body.id,
        code: departmentCode,
        name: 'Reporting Department',
      })
      .expect(201);

    await dataSource.query(
      `INSERT INTO usage_records
         (id, tenant_id, metric, quantity, recorded_at, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'API_CALLS', 42, now(), '{}'::jsonb, now(), now())`,
      [abcTenantId],
    );

    const hooks = await dataSource.query(
      `INSERT INTO webhooks (id, tenant_id, name, url, events, secret, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'https://93.184.216.34/report-hook', '[]'::jsonb, 'secret', 'active', now(), now())
       RETURNING id`,
      [abcTenantId, `Report hook ${stamp}`],
    );
    webhookId = hooks[0].id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous and users without admin.access', async () => {
    await request(app.getHttpServer()).get('/reports/catalog').expect(401);
    await request(app.getHttpServer())
      .get('/reports/catalog')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/reports/schedules')
      .set(auth(salesToken))
      .send({ name: 'nope', reportType: 'BILLING' })
      .expect(403);
  });

  it('exposes the report catalog with export columns', async () => {
    const catalog = await request(app.getHttpServer())
      .get('/reports/catalog')
      .set(auth(adminToken))
      .expect(200);
    expect(catalog.body).toHaveLength(7);
    const types = catalog.body.map((row: { type: string }) => row.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'TENANT_ACTIVITY',
        'DEPARTMENT_ACTIVITY',
        'BILLING',
        'REVENUE',
        'USAGE',
        'SECURITY',
        'AUTOMATION',
      ]),
    );
    for (const definition of catalog.body) {
      expect(Array.isArray(definition.columns)).toBe(true);
      expect(definition.columns.length).toBeGreaterThan(0);
      expect(definition.title).toEqual(expect.any(String));
    }
  });

  it('generates the tenant activity report with a period filter', async () => {
    const from = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/reports/TENANT_ACTIVITY?from=${from}&to=${to}`)
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.type).toBe('TENANT_ACTIVITY');
    expect(res.body.columns).toEqual(['action', 'events']);
    expect(res.body.period.from).toBe(from);
    expect(res.body.summary.totalEvents).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.activeMembers).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.rows[0]).toEqual(
      expect.objectContaining({ action: expect.any(String), events: expect.any(Number) }),
    );
  });

  it('generates the department activity report', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/DEPARTMENT_ACTIVITY')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.columns).toEqual(['code', 'name', 'members', 'events']);
    const department = res.body.rows.find(
      (row: { code: string }) => row.code === departmentCode,
    );
    expect(department).toBeDefined();
    expect(department.name).toBe('Reporting Department');
    expect(typeof department.members).toBe('number');
    expect(typeof department.events).toBe('number');
    expect(res.body.summary.departments).toBeGreaterThanOrEqual(1);
  });

  it('generates billing and revenue reports', async () => {
    const billing = await request(app.getHttpServer())
      .get('/reports/BILLING')
      .set(auth(adminToken))
      .expect(200);
    expect(billing.body.columns).toEqual([
      'status',
      'invoices',
      'totalAmount',
      'paidAmount',
    ]);
    expect(billing.body.summary.subscription).toEqual(
      expect.objectContaining({
        planCode: expect.any(String),
        status: 'ACTIVE',
      }),
    );
    expect(billing.body.summary.totalAmount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(billing.body.rows)).toBe(true);

    const revenue = await request(app.getHttpServer())
      .get('/reports/REVENUE')
      .set(auth(adminToken))
      .expect(200);
    expect(revenue.body.columns).toEqual(['month', 'invoices', 'revenue']);
    expect(revenue.body.summary.totalRevenue).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(revenue.body.summary.byProvider)).toBe(true);
    expect(Array.isArray(revenue.body.rows)).toBe(true);
  });

  it('generates usage, security and automation reports', async () => {
    const usage = await request(app.getHttpServer())
      .get('/reports/USAGE')
      .set(auth(adminToken))
      .expect(200);
    expect(usage.body.columns).toEqual(['metric', 'quantity', 'records']);
    const apiCalls = usage.body.rows.find(
      (row: { metric: string }) => row.metric === 'API_CALLS',
    );
    expect(apiCalls).toBeDefined();
    expect(apiCalls.quantity).toBeGreaterThanOrEqual(42);

    const security = await request(app.getHttpServer())
      .get('/reports/SECURITY')
      .set(auth(adminToken))
      .expect(200);
    expect(security.body.columns).toEqual([
      'eventType',
      'severity',
      'events',
      'openEvents',
    ]);
    expect(typeof security.body.summary.failedLogins).toBe('number');
    expect(typeof security.body.summary.alertTriggers).toBe('number');
    expect(Array.isArray(security.body.rows)).toBe(true);

    const automation = await request(app.getHttpServer())
      .get('/reports/AUTOMATION')
      .set(auth(adminToken))
      .expect(200);
    expect(automation.body.columns).toEqual(['category', 'name', 'count']);
    expect(typeof automation.body.summary.scheduledJobs).toBe('number');
    expect(
      automation.body.rows.some(
        (row: { category: string }) => row.category === 'SCHEDULED_JOB',
      ),
    ).toBe(true);
  });

  it('rejects an unknown report type', async () => {
    await request(app.getHttpServer())
      .get('/reports/NOT_A_REPORT')
      .set(auth(adminToken))
      .expect(400);
  });

  it('exports reports as CSV, Excel and PDF', async () => {
    const csv = await request(app.getHttpServer())
      .get('/reports/TENANT_ACTIVITY/export?format=CSV')
      .set(auth(adminToken))
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text.split('\n')[0]).toBe('action,events');

    const excel = await request(app.getHttpServer())
      .get('/reports/TENANT_ACTIVITY/export?format=EXCEL')
      .set(auth(adminToken))
      .expect(200);
    expect(excel.headers['content-type']).toContain('application/vnd.ms-excel');
    expect(excel.text).toContain('mso-application');

    const pdf = await request(app.getHttpServer())
      .get('/reports/TENANT_ACTIVITY/export?format=PDF')
      .set(auth(adminToken))
      .buffer(true)
      .parse((res: any, callback: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  });


  it('runs a report and delivers it in-app, by email and to a webhook', async () => {
    const run = await request(app.getHttpServer())
      .post('/reports/TENANT_ACTIVITY/run')
      .set(auth(adminToken))
      .send({
        format: 'PDF',
        channels: ['IN_APP', 'EMAIL', 'WEBHOOK'],
        recipients: ['cfo@abctrading.vn'],
        webhookIds: [webhookId],
      })
      .expect(201);
    runId = run.body.id;
    expect(run.body.status).toBe('COMPLETED');
    expect(run.body.rowCount).toBeGreaterThanOrEqual(1);
    expect(run.body.summary.totalEvents).toBeGreaterThanOrEqual(1);

    const detail = await request(app.getHttpServer())
      .get(`/reports/runs/${runId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.deliveries).toHaveLength(3);
    const channels = detail.body.deliveries.map(
      (row: { channel: string }) => row.channel,
    );
    expect(channels).toEqual(
      expect.arrayContaining(['IN_APP', 'EMAIL', 'WEBHOOK']),
    );
    for (const delivery of detail.body.deliveries) {
      expect(delivery.status).toBe('SENT');
      expect(delivery.deliveredAt).toBeTruthy();
    }

    const integrationLogs = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM integration_logs
        WHERE tenant_id = $1 AND event = 'report.generated'`,
      [abcTenantId],
    );
    expect(integrationLogs[0].total).toBeGreaterThanOrEqual(1);

    const notifications = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM notifications
        WHERE tenant_id = $1 AND type = 'report'`,
      [abcTenantId],
    );
    expect(notifications[0].total).toBeGreaterThanOrEqual(2);
  });

  it('creates a schedule, runs it and advances the next run', async () => {
    const created = await request(app.getHttpServer())
      .post('/reports/schedules')
      .set(auth(adminToken))
      .send({
        name: `Daily billing ${stamp}`,
        reportType: 'BILLING',
        format: 'EXCEL',
        frequency: 'DAILY',
        deliveryChannels: ['IN_APP'],
        recipients: ['cfo@abctrading.vn'],
      })
      .expect(201);
    scheduleId = created.body.id;
    expect(created.body.enabled).toBe(true);
    expect(new Date(created.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    const firstNextRun = new Date(created.body.nextRunAt).getTime();

    const listed = await request(app.getHttpServer())
      .get('/reports/schedules')
      .set(auth(adminToken))
      .expect(200);
    expect(listed.body.map((row: { id: string }) => row.id)).toContain(scheduleId);

    const updated = await request(app.getHttpServer())
      .patch(`/reports/schedules/${scheduleId}`)
      .set(auth(adminToken))
      .send({ frequency: 'WEEKLY' })
      .expect(200);
    expect(updated.body.frequency).toBe('WEEKLY');
    expect(new Date(updated.body.nextRunAt).getTime()).toBeGreaterThan(
      firstNextRun,
    );

    const run = await request(app.getHttpServer())
      .post(`/reports/schedules/${scheduleId}/run`)
      .set(auth(adminToken))
      .send({})
      .expect(201);
    expect(run.body.scheduleId).toBe(scheduleId);
    expect(run.body.reportType).toBe('BILLING');
    expect(run.body.format).toBe('EXCEL');
    expect(run.body.status).toBe('COMPLETED');

    const schedule = await request(app.getHttpServer())
      .get(`/reports/schedules/${scheduleId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(schedule.body.lastRunId).toBe(run.body.id);
    expect(schedule.body.lastRunAt).toBeTruthy();
  });

  it('lists run history, exposes metrics and writes audit records', async () => {
    const runs = await request(app.getHttpServer())
      .get('/reports/runs?reportType=TENANT_ACTIVITY&limit=10')
      .set(auth(adminToken))
      .expect(200);
    expect(runs.body.map((row: { id: string }) => row.id)).toContain(runId);

    const billingRuns = await request(app.getHttpServer())
      .get('/reports/runs?reportType=BILLING')
      .set(auth(adminToken))
      .expect(200);
    expect(billingRuns.body.length).toBeGreaterThanOrEqual(1);

    const metrics = await request(app.getHttpServer())
      .get('/reports/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('report_runs_total');
    expect(metrics.text).toContain('report_exports_total');
    expect(metrics.text).toContain('report_deliveries_total');

    const audits = await dataSource.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'report'`,
      [abcTenantId],
    );
    expect(audits[0].total).toBeGreaterThanOrEqual(1);
  });

  it('keeps report runs and schedules tenant-isolated', async () => {
    await request(app.getHttpServer())
      .get(`/reports/runs/${runId}`)
      .set(auth(cafeToken))
      .expect(404);

    const cafeRuns = await request(app.getHttpServer())
      .get('/reports/runs')
      .set(auth(cafeToken))
      .expect(200);
    expect(
      cafeRuns.body.some((row: { id: string }) => row.id === runId),
    ).toBe(false);

    const cafeSchedules = await request(app.getHttpServer())
      .get('/reports/schedules')
      .set(auth(cafeToken))
      .expect(200);
    expect(
      cafeSchedules.body.some((row: { id: string }) => row.id === scheduleId),
    ).toBe(false);

    const cafeBilling = await request(app.getHttpServer())
      .get('/reports/BILLING')
      .set(auth(cafeToken))
      .expect(200);
    expect(cafeBilling.body.summary.subscription.status).toBe('ACTIVE');
  });
});

