/**
 * Customer Portal (A1) – e2e
 *
 * Requires seeded DB with ABC tenant and admin@abctrading.vn
 * Run: npm run migration:run && npm run seed
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Customer Portal (e2e)', () => {
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

  it('GET /portal/dashboard returns aggregated data', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentPlan');
    expect(res.body).toHaveProperty('subscriptionStatus');
    expect(res.body).toHaveProperty('usageSummary');
    expect(res.body).toHaveProperty('recentPayments');
    expect(res.body).toHaveProperty('recentInvoices');
  });

  it('GET /portal/subscription returns current subscription', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/subscription')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('GET /portal/invoices lists invoices', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/invoices')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /portal/usage returns usage vs limits', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/usage')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('metric');
      expect(res.body[0]).toHaveProperty('current');
      expect(res.body[0]).toHaveProperty('limit');
      expect(res.body[0]).toHaveProperty('percentage');
    }
  });

  it('GET /portal/payments returns payment history', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portal/payments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/portal/dashboard');
    expect(res.status).toBe(401);
  });
});
