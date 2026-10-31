/**
 * Tenant Offboarding (A5) – e2e
 *
 * Creates its own tenant via onboarding, logs in as the new owner,
 * then offboards THAT tenant. Does NOT touch the demo ABC tenant.
 *
 * Requires migrations 1750000000000 + 1751000000000 + FREE plan seeded.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Tenant Offboarding (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let offboardingId: string;

  const PASSWORD = 'Password123!';
  const UNIQUE = Date.now().toString(36);
  const TENANT_CODE = `OFF${UNIQUE}`;
  const OWNER_EMAIL = `off-owner-${UNIQUE}@test.vn`;

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

    // 1. Login as existing demo admin (ABC) only to call onboarding
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@abctrading.vn', password: PASSWORD, tenant: 'ABC' });

    if (!adminLogin.body.accessToken) {
      throw new Error(`Admin login failed: ${adminLogin.status} ${JSON.stringify(adminLogin.body)}`);
    }
    const adminToken = adminLogin.body.accessToken;

    // 2. Create a throwaway tenant via onboarding
    const onboard = await request(app.getHttpServer())
      .post('/api/v1/onboarding/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: TENANT_CODE,
        slug: `off${UNIQUE}`,
        name: `Offboard Test ${UNIQUE}`,
        ownerEmail: OWNER_EMAIL,
        ownerFullName: 'Offboard Owner',
        ownerPassword: PASSWORD,
      });

    if (onboard.status !== 201) {
      console.error('[SETUP ONBOARD FAIL]', onboard.status, onboard.body);
    }
    expect(onboard.status).toBe(201);

    // 3. Login as the NEW owner of the throwaway tenant
    const ownerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: OWNER_EMAIL, password: PASSWORD, tenant: TENANT_CODE });

    if (!ownerLogin.body.accessToken) {
      throw new Error(`Owner login failed: ${ownerLogin.status} ${JSON.stringify(ownerLogin.body)}`);
    }
    ownerToken = ownerLogin.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /offboarding/start runs the flow on the new tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/offboarding/start')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        reason: 'Testing offboarding on isolated tenant',
        exportData: true,
        deactivateUsers: true,
        revokeApiKeys: true,
        cancelSubscription: true,
      });

    if (res.status !== 201) {
      console.error('[OFFBOARDING FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(['COMPLETED', 'FAILED', 'PROCESSING']).toContain(res.body.status);
    offboardingId = res.body.id;
  });

  it('GET /offboarding/:id returns the record', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/offboarding/${offboardingId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(offboardingId);
  });

  it('GET /offboarding/report/:id returns report', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/offboarding/report/${offboardingId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('report');
  });

  it('GET /offboarding lists records', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/offboarding')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/offboarding/start').send({});
    expect(res.status).toBe(401);
  });
});
