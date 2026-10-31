/**
 * Auto Notification (B8) – e2e
 *
 * Requires migration 1760000000000.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auto Notification (e2e)', () => {
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

  it('POST /auto-notifications/trigger sends across channels', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auto-notifications/trigger')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        event: 'INVOICE_CREATED',
        recipient: 'admin@abctrading.vn',
        channels: ['EMAIL', 'IN_APP'],
        variables: { invoiceNumber: 'INV-001', amount: 1500000 },
      });

    if (res.status !== 201) {
      console.error('[TRIGGER FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].status).toBeDefined();
  });

  it('GET /auto-notifications lists logs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auto-notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /auto-notifications/metrics returns prometheus text', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auto-notifications/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.text).toBe('string');
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auto-notifications/trigger').send({});
    expect(res.status).toBe(401);
  });
});
