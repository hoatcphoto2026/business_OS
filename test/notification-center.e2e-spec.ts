/**
 * Notification Center (A2) – e2e
 *
 * Requires seeded DB.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Notification Center (e2e)', () => {
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

  it('GET /notifications returns list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /notifications/send creates notification + delivery log', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/notifications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Test Invoice',
        body: 'Invoice {{invoiceNumber}} for {{amount}}',
        variables: { invoiceNumber: 'INV-001', amount: 1500000 },
        channels: ['IN_APP'],
      });

    if (res.status !== 201) {
      console.error('[SEND FAIL]', res.status, res.body);
    }
    console.log('[SEND RESPONSE]', res.status, JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(201);
    expect(res.body.notification).toBeDefined();
    expect(res.body.deliveries).toBeDefined();
    expect(Array.isArray(res.body.deliveries)).toBe(true);
  });

  it('GET /notifications/metrics returns prometheus text', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body === 'string' || typeof res.text === 'string').toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});
