/**
 * Billing Security – e2e
 *
 * Verifies step-up is required for sensitive billing actions.
 * Prerequisites: migration:run + seed.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Billing Security (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

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

    await dataSource.query(`UPDATE tenants SET status = 'active' WHERE code = 'ABC'`);

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

  it('change-plan requires step-up (412 without token)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/change-plan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planCode: 'starter', billingCycle: 'MONTHLY' });

    expect(res.status).toBe(412);
    expect(res.body.action).toBe('billing.change-plan');
  });

  it('cancel requires step-up (412 without token)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/cancel')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cancelAtPeriodEnd: true });

    expect(res.status).toBe(412);
    expect(res.body.action).toBe('billing.cancel');
  });

  it('refund requires step-up (412 without token)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/payment/refund')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ transactionId: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBe(412);
    expect(res.body.action).toBe('billing.refund');
  });

  it('GET plans does not require step-up', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
