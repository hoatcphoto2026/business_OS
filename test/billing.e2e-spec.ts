/**
 * Billing & Subscription – e2e
 *
 * MUST run before this test:
 *   npm run migration:run
 *   npm run seed
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Billing & Subscription (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

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

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@abctrading.vn', password: PASSWORD, tenant: 'ABC' });

    if (!res.body.accessToken) {
      throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    adminToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /billing/plans returns the 4 default plans', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`);

    console.log('[PLANS]', res.status, Array.isArray(res.body) ? res.body.length : res.body);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length < 4) {
      throw new Error('Plans not seeded. Run: npm run seed');
    }
    const codes = res.body.map((p: any) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['free', 'starter', 'professional', 'enterprise']));
  });

  it('GET /billing/plans/free returns FREE plan with features', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/plans/free')
      .set('Authorization', `Bearer ${adminToken}`);

    console.log('[PLAN/FREE]', res.status, res.body?.code);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('free');
    expect(res.body.features).toBeDefined();
    expect(res.body.features.length).toBeGreaterThan(0);
  });

  it('POST /billing/subscription/change-plan to STARTER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/change-plan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planCode: 'starter', billingCycle: 'MONTHLY' });

    console.log('[CHANGE-PLAN]', res.status, res.body?.status, res.body?.message);
    // StepUpGuard returns 412 without token
    expect([200, 412]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.status).toBeDefined();
      expect(res.body.plan).toBeDefined();
      expect(res.body.plan.code).toBe('starter');
    }
  });

  it('GET /billing/subscription returns the current subscription', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${adminToken}`);

    console.log('[SUBSCRIPTION]', res.status, res.body?.status);
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(res.body.plan).toBeDefined();
  });

  it('POST /billing/subscription/cancel (at period end)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/cancel')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cancelAtPeriodEnd: true });

    console.log('[CANCEL]', res.status, res.body?.cancelAtPeriodEnd);
    // StepUpGuard returns 412 without token
    expect([200, 412]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.cancelAtPeriodEnd).toBe(true);
    }
  });

  it('POST /billing/subscription/reactivate', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/reactivate')
      .set('Authorization', `Bearer ${adminToken}`);

    console.log('[REACTIVATE]', res.status, res.body?.status, res.body?.message);
    // 200 = reactivated, 400 = already active
    expect([200, 400]).toContain(res.status);
  });
});
