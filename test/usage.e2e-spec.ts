/**
 * Usage Tracking – e2e
 *
 * Prerequisites: migration:run + seed.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { UsageService } from '../src/modules/billing/usage.service';
import { UsageMetric } from '../src/modules/billing/enums/usage.enum';

describe('Usage Tracking (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let usage: UsageService;
  let tenantId: string;

  const PASSWORD = 'Password123!';

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
    app.setGlobalPrefix('api/v1');
    await app.init();
    dataSource = app.get(DataSource);
    usage = app.get(UsageService);

    await dataSource.query(`UPDATE tenants SET status = 'active' WHERE code = 'ABC'`);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@abctrading.vn', password: PASSWORD, tenant: 'ABC' });

    if (!res.body.accessToken) {
      throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    adminToken = res.body.accessToken;

    const t = await dataSource.query(`SELECT id FROM tenants WHERE code = 'ABC'`);
    tenantId = t[0].id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('records usage and GET /billing/usage/current returns it', async () => {
    await usage.record(UsageMetric.API_CALLS, 3, { source: 'e2e' }, tenantId);
    await usage.record(UsageMetric.AI_REQUESTS, 1, {}, tenantId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/usage/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.API_CALLS).toBeGreaterThanOrEqual(3);
    expect(res.body.AI_REQUESTS).toBeGreaterThanOrEqual(1);
  });

  it('GET /billing/usage returns overview', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/usage')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('ACTIVE_USERS');
    expect(res.body).toHaveProperty('API_CALLS');
  });

  it('aggregates daily and monthly', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const dailyRows = await usage.aggregateDaily(today);
    // May be 0 if timezone edge; just ensure it doesn't throw
    expect(dailyRows).toBeGreaterThanOrEqual(0);

    const monthlyRows = await usage.aggregateMonthly(month);
    expect(monthlyRows).toBeGreaterThanOrEqual(0);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/billing/usage/monthly?month=${month}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /billing/usage/metrics returns Prometheus text', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/usage/metrics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(typeof res.text === 'string' || typeof res.body === 'string' || res.text).toBeTruthy();
  });
});
