/**
 * PayOS – e2e (sandbox mode)
 *
 * Prerequisites: migration:run + seed.
 * Without real credentials, the gateway runs in sandbox/mock mode.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('PayOS (e2e)', () => {
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

  let payosRef: string;
  const amount = 150000;

  it('POST /billing/payment/create with PAYOS returns PENDING', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/payment/create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount,
        currency: 'VND',
        provider: 'PAYOS',
        idempotencyKey: `payos-${Date.now()}`,
      })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(res.body.externalId).toMatch(/^payos_/);
    payosRef = res.body.providerRef;
    expect(payosRef).toBeDefined();
  });
});
