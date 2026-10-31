/**
 * Auto Invoice (B7) – e2e
 *
 * Requires migration 1759000000000.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auto Invoice (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let invoiceId: string;

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

  it('POST /auto-invoices/generate creates an invoice with items', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auto-invoices/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        trigger: 'MONTHLY_BILLING',
        couponCode: 'WELCOME10',
        discountPercent: 10,
        taxPercent: 10,
      });

    if (res.status !== 201) {
      console.error('[GENERATE FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.invoiceNumber).toBeDefined();
    expect(res.body.status).toBe('GENERATED');
    expect(Number(res.body.total)).toBeGreaterThan(0);
    invoiceId = res.body.id;
  });

  it('GET /auto-invoices lists invoices', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auto-invoices')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /auto-invoices/:id returns invoice with items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/auto-invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(invoiceId);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auto-invoices/generate').send({});
    expect(res.status).toBe(401);
  });
});
