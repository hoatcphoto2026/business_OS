/**
 * Tenant Onboarding (A4) – e2e
 *
 * Requires migration 1750000000000 + seeded FREE plan.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Tenant Onboarding (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let onboardingId: string;

  const PASSWORD = 'Password123!';
  const UNIQUE = Date.now().toString(36);

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

  it('POST /onboarding/start creates tenant + owner + trial', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/onboarding/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `T${UNIQUE}`,
        slug: `t${UNIQUE}`,
        name: `Test Tenant ${UNIQUE}`,
        ownerEmail: `owner-${UNIQUE}@test.vn`,
        ownerFullName: 'Test Owner',
        ownerPassword: 'Password123!',
      });

    if (res.status !== 201) {
      console.error('[ONBOARDING FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(['COMPLETED', 'FAILED']).toContain(res.body.status);
    onboardingId = res.body.id;
  });

  it('GET /onboarding/:id returns the record', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/onboarding/${onboardingId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(onboardingId);
  });

  it('GET /onboarding lists records', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/onboarding')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/onboarding/start').send({});
    expect(res.status).toBe(401);
  });
});
