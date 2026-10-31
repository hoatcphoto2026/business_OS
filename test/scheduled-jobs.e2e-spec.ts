/**
 * Scheduled Jobs Platform (B2) – e2e
 *
 * Requires migration 1754000000000.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Scheduled Jobs (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let jobId: string;

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

  it('POST /jobs creates a scheduled job', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Daily Invoice Generation',
        jobType: 'INVOICE_GENERATION',
        scheduleType: 'DAILY',
        maxRetries: 3,
      });

    if (res.status !== 201) {
      console.error('[CREATE JOB FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.jobType).toBe('INVOICE_GENERATION');
    jobId = res.body.id;
  });

  it('GET /jobs lists jobs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /jobs/:id/run executes the job', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/run`)
      .set('Authorization', `Bearer ${adminToken}`);

    if (res.status !== 200) {
      console.error('[RUN JOB FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  it('GET /jobs/history lists execution history', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/jobs/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/jobs');
    expect(res.status).toBe(401);
  });
});
