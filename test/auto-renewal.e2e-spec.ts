/**
 * Auto Renewal (B5) – e2e
 *
 * Requires migration 1757000000000.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auto Renewal (e2e)', () => {
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

  it('POST /renewals/process runs due renewals', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/renewals/process')
      .set('Authorization', `Bearer ${adminToken}`);

    if (res.status !== 200) {
      console.error('[PROCESS FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /renewals lists attempts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/renewals')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /renewals/metrics returns prometheus text', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/renewals/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.text).toBe('string');
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/renewals/process');
    expect(res.status).toBe(401);
  });
});
