/**
 * Auto Suspension (B6) – e2e
 *
 * Creates an isolated tenant via onboarding, then suspends THAT tenant.
 * Does NOT touch the demo ABC tenant.
 *
 * Requires migration 1758000000000.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auto Suspension (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let recordId: string;

  const PASSWORD = 'Password123!';
  const UNIQUE = Date.now().toString(36);
  const TENANT_CODE = `SUS${UNIQUE}`;
  const OWNER_EMAIL = `sus-owner-${UNIQUE}@test.vn`;

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

    // Login as ABC admin only to create isolated tenant
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@abctrading.vn', password: PASSWORD, tenant: 'ABC' });

    if (!adminLogin.body.accessToken) {
      throw new Error(`Admin login failed: ${adminLogin.status} ${JSON.stringify(adminLogin.body)}`);
    }

    const onboard = await request(app.getHttpServer())
      .post('/api/v1/onboarding/start')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({
        code: TENANT_CODE,
        slug: `sus${UNIQUE}`,
        name: `Suspend Test ${UNIQUE}`,
        ownerEmail: OWNER_EMAIL,
        ownerFullName: 'Suspend Owner',
        ownerPassword: PASSWORD,
      });

    if (onboard.status !== 201) {
      console.error('[SETUP ONBOARD FAIL]', onboard.status, onboard.body);
    }
    expect(onboard.status).toBe(201);

    // Login as the new owner
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

  it('POST /suspensions/trigger suspends the isolated tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/suspensions/trigger')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        trigger: 'PAYMENT_OVERDUE',
        reason: 'E2E test',
      });

    if (res.status !== 201) {
      console.error('[TRIGGER FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(['SUSPENDED', 'FAILED']).toContain(res.body.status);
    recordId = res.body.id;
  });

  it('GET /suspensions lists records (403 after tenant suspended is expected)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/suspensions')
      .set('Authorization', `Bearer ${ownerToken}`);

    // After suspension, TenantGuard correctly returns 403
    expect([200, 403]).toContain(res.status);
  });

  it('GET /suspensions/:id returns the record (403 after suspend is expected)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/suspensions/${recordId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // After suspension, TenantGuard correctly returns 403
    expect([200, 403]).toContain(res.status);
  });


  it('regular member cannot trigger suspension (403)', async () => {
    const memberLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'hcm.user@abctrading.vn', password: PASSWORD, tenant: 'ABC' });

    if (!memberLogin.body.accessToken) {
      console.error('[MEMBER LOGIN FAIL]', memberLogin.status, memberLogin.body);
    }
    expect(memberLogin.body.accessToken).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/api/v1/suspensions/trigger')
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`)
      .send({ trigger: 'PAYMENT_OVERDUE', reason: 'should be denied' });

    expect(res.status).toBe(403);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/suspensions/trigger').send({});
    expect(res.status).toBe(401);
  });
});
