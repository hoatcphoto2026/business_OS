/**
 * Billing Invoices – e2e
 *
 * Prerequisites: migration:run + seed.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Billing Invoices (e2e)', () => {
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

    // Ensure a subscription exists
    await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/change-plan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planCode: 'starter', billingCycle: 'MONTHLY' });
  });

  afterAll(async () => {
    await app?.close();
  });

  let invoiceId: string;

  it('POST /billing/invoices/generate creates an invoice', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/invoices/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ taxRate: 10 })
      .expect(201);

    expect(res.body.invoiceNumber).toMatch(/^INV-/);
    expect(res.body.status).toBe('ISSUED');
    expect(parseFloat(res.body.total)).toBeGreaterThan(0);
    expect(res.body.items).toBeDefined();
    invoiceId = res.body.id;
  });

  it('GET /billing/invoices lists invoices', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /billing/invoices/:id returns the invoice', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/billing/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.id).toBe(invoiceId);
    expect(res.body.invoiceNumber).toBeDefined();
  });

  it('POST /billing/invoices/:id/void voids the invoice', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/billing/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.status).toBe('VOID');
    expect(res.body.voidedAt).toBeDefined();
  });
});
