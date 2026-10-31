/**
 * VietQR + Banking webhook – e2e
 *
 * Prerequisites: migration:run + seed.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('VietQR & Banking (e2e)', () => {
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

  let txnId: string;
  let content: string;
  const amount = 250000;
  const idempotencyKey = `vietqr-${Date.now()}`;

  it('POST /billing/payment/create with VIETQR returns PENDING + QR URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/payment/create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount,
        currency: 'VND',
        provider: 'VIETQR',
        idempotencyKey,
      })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(res.body.metadata?.qrUrl).toContain('vietqr.io');
    expect(res.body.providerRef).toBeDefined();
    txnId = res.body.id;
    content = res.body.providerRef;
  });

  it('banking webhook with wrong signature is rejected', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/billing/payment/webhook/banking')
      .send({
        content,
        amount,
        signature: 'wrong',
      })
      .expect(400);
  });

  it('banking webhook with matching content + amount marks SUCCESS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/payment/webhook/banking')
      .send({
        content,
        amount,
        bankTxnId: 'BANK123456',
        signature: 'bank-secret',
      })
      .expect(200);

    expect(res.body.matched).toBe(true);

    // Verify status updated
    const check = await dataSource.query(
      `SELECT status FROM payment_transactions WHERE id = $1`,
      [txnId],
    );
    expect(check[0].status).toBe('SUCCESS');
  });

  it('banking webhook with amount mismatch does not match', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/payment/webhook/banking')
      .send({
        content: 'UNKNOWN',
        amount: 1,
        signature: 'bank-secret',
      })
      .expect(200);

    expect(res.body.matched).toBe(false);
  });
});
