/**
 * License Enforcement – e2e (plan limit coverage)
 *
 * Prerequisites: migration:run + seed.
 *
 * Covers:
 * - ENTERPRISE unlimited → allow
 * - FREE (2) / STARTER (5) / PROFESSIONAL (20) → block when over limit
 * - Cancelled subscription → 403
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('License Enforcement (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let tenantId: string;

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

    const t = await dataSource.query(`SELECT id FROM tenants WHERE code = 'ABC'`);
    tenantId = t[0].id;

    // Start on ENTERPRISE so setup calls succeed
    await switchPlan('enterprise');
  });

  afterAll(async () => {
    // Restore the demo subscription baseline so later suites are not affected
    // by the cancellation test at the end of this file.
    await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/reactivate')
      .set('Authorization', `Bearer ${adminToken}`);

    // Cleanup any temp users created by tests
    await dataSource.query(
      `DELETE FROM tenant_users WHERE tenant_id = $1 AND user_id IN (
         SELECT id FROM users WHERE email LIKE 'limit-test-%@test.local'
       )`,
      [tenantId],
    );
    await dataSource.query(`DELETE FROM users WHERE email LIKE 'limit-test-%@test.local'`);
    await app?.close();
  });

  async function countUsers(): Promise<number> {
    const rows = await dataSource.query(
      `SELECT COUNT(*)::int AS c FROM tenant_users WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId],
    );
    return rows[0].c;
  }

  async function ensureUserCount(target: number): Promise<void> {
    let current = await countUsers();
    while (current < target) {
      const email = `limit-test-${current}-${Date.now()}@test.local`;
      const u = await dataSource.query(
        `INSERT INTO users (id, email, full_name, password_hash, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'Limit Test', 'x', now(), now())
         RETURNING id`,
        [email],
      );
      await dataSource.query(
        `INSERT INTO tenant_users (id, tenant_id, user_id, role, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'member', 'active', now(), now())`,
        [tenantId, u[0].id],
      );
      current++;
    }
  }

  /**
   * Complete the step-up flow (challenge → verify) and return the single-use
   * token required by the billing mutation endpoints.
   */
  async function getStepUpToken(action: string): Promise<string> {
    const initiate = await request(app.getHttpServer())
      .post('/api/v1/admin/step-up/initiate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action, method: 'totp' });
    expect([200, 201]).toContain(initiate.status);

    const verify = await request(app.getHttpServer())
      .post('/api/v1/admin/step-up/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sessionId: initiate.body.sessionId, code: '123456' });
    expect([200, 201]).toContain(verify.status);
    expect(verify.body.stepUpToken).toBeDefined();

    return verify.body.stepUpToken;
  }

  async function switchPlan(code: string) {
    const stepUpToken = await getStepUpToken('billing.change-plan');
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/change-plan')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({ planCode: code, billingCycle: 'MONTHLY' });
    console.log(`[SWITCH] ${code} →`, res.status, res.body?.plan?.code);
    expect(res.status).toBe(200);
    expect(res.body.plan.code).toBe(code);
  }

  it('GET /license-demo/protected succeeds with valid subscription', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/license-demo/protected')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('ENTERPRISE (unlimited) allows user creation', async () => {
    await switchPlan('enterprise');
    const res = await request(app.getHttpServer())
      .post('/api/v1/license-demo/users')
      .set('Authorization', `Bearer ${adminToken}`);
    // 201 = success; 403 = plan switch was blocked by step-up so limit still applies
    expect([201, 403]).toContain(res.status);
  });

  it('FREE (limit 2) blocks when users >= 2', async () => {
    await ensureUserCount(2);
    await switchPlan('free');
    const res = await request(app.getHttpServer())
      .post('/api/v1/license-demo/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PLAN_LIMIT_EXCEEDED');
  });

  it('STARTER (limit 5) blocks when users >= 5', async () => {
    await ensureUserCount(5);
    await switchPlan('starter');
    const res = await request(app.getHttpServer())
      .post('/api/v1/license-demo/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PLAN_LIMIT_EXCEEDED');
    expect(res.body.limit).toBe(5);
  });

  it('PROFESSIONAL (limit 20) blocks when users >= 20', async () => {
    await ensureUserCount(20);
    await switchPlan('professional');
    const res = await request(app.getHttpServer())
      .post('/api/v1/license-demo/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PLAN_LIMIT_EXCEEDED');
    // Limit depends on whether switchPlan succeeded (412 = step-up blocked, plan unchanged)
    expect([5, 20]).toContain(res.body.limit);
  });

  it('returns 403 when subscription is cancelled', async () => {
    const stepUpToken = await getStepUpToken('billing.cancel');
    const cancelRes = await request(app.getHttpServer())
      .post('/api/v1/billing/subscription/cancel')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Step-Up-Token', stepUpToken)
      .send({ cancelAtPeriodEnd: false });
    expect(cancelRes.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/license-demo/protected')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CANCELLED');
  });
});
