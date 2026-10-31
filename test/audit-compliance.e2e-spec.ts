/**
 * C1 Audit & Compliance Platform.
 * Requires migration:run and seed. No global prefix, same as the other e2e suites.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Audit & Compliance Platform (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cafeToken: string;

  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const login = async (email: string, tenant: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      return res.body.accessToken as string;
    };

    adminToken = await login('admin@abctrading.vn', 'ABC');
    cafeToken = await login('owner@cafemoc.vn', 'CAFE_MOC');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous access', async () => {
    await request(app.getHttpServer()).get('/audit').expect(401);
  });

  it('lists authentication events recorded at login', async () => {
    const res = await request(app.getHttpServer())
      .get('/audit')
      .query({
        category: 'AUTHENTICATION',
        action: 'LOGIN',
        actorEmail: 'admin@abctrading.vn',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
    expect(res.body.events.every((event: { actorEmail: string; action: string; category: string }) =>
      event.actorEmail === 'admin@abctrading.vn' &&
      event.action === 'LOGIN' &&
      event.category === 'AUTHENTICATION',
    )).toBe(true);

    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-request-id', 'trace-c1-audit')
      .send({ name: 'Audit Customer', code: `AUD-${Date.now()}`, email: 'audit-c1@test.vn' })
      .expect(201);

    const traced = await request(app.getHttpServer())
      .get('/audit/search')
      .query({ resourceType: 'customer', resourceId: created.body.id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(traced.body.events[0].traceId).toBe('trace-c1-audit');
  });

  it('searches by category and does not leak another tenant', async () => {
    const abc = await request(app.getHttpServer())
      .get('/audit/search')
      .query({ category: 'AUTHENTICATION', q: 'LOGIN' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(abc.body.events.length).toBeGreaterThan(0);
    expect(abc.body.events.every((event: { category: string }) => event.category === 'AUTHENTICATION')).toBe(true);

    const cafe = await request(app.getHttpServer())
      .get('/audit/search')
      .query({ actorEmail: 'admin@abctrading.vn' })
      .set('Authorization', `Bearer ${cafeToken}`)
      .expect(200);
    expect(cafe.body.events).toEqual([]);
  });

  it('exports csv, excel, and pdf', async () => {
    const csv = await request(app.getHttpServer())
      .get('/audit/export')
      .query({ format: 'csv' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toContain('eventId');

    const excel = await request(app.getHttpServer())
      .get('/audit/export')
      .query({ format: 'excel' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(excel.headers['content-type']).toContain('application/vnd.ms-excel');
    expect(excel.text).toContain('<Workbook');

    const pdf = await request(app.getHttpServer())
      .get('/audit/export')
      .query({ format: 'pdf' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('builds the four compliance reports', async () => {
    for (const type of ['user-activity', 'billing-activity', 'security-events', 'suspicious-activity']) {
      const res = await request(app.getHttpServer())
        .get('/audit/reports')
        .query({ type })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.reportType).toBe(type);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.summary.total).toBe(res.body.events.length);
    }

    const security = await request(app.getHttpServer())
      .get('/audit/reports')
      .query({ type: 'security-events' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(security.body.events.some((event: { category: string }) => event.category === 'AUTHENTICATION')).toBe(true);
  });

  it('returns 90, 180, 365 and custom retention, then activates custom', async () => {
    const listed = await request(app.getHttpServer())
      .get('/audit/retention')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const codes = listed.body.policies.map((policy: { code: string }) => policy.code);
    expect(codes).toEqual(expect.arrayContaining(['DAYS_90', 'DAYS_180', 'DAYS_365', 'CUSTOM']));

    const custom = await request(app.getHttpServer())
      .get('/audit/retention')
      .query({ activate: 'CUSTOM', customDays: 120 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const policy = custom.body.policies.find((row: { code: string }) => row.code === 'CUSTOM');
    expect(policy.days).toBe(120);
    expect(policy.isActive).toBe(true);
    expect(policy.isCustom).toBe(true);
  });

  it('exposes prometheus counters', async () => {
    const res = await request(app.getHttpServer())
      .get('/audit/metrics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.text).toContain('audit_events_recorded_total');
  });
});
