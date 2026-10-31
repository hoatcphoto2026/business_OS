/**
 * Integration / E2E tests for Multi-Tenant Isolation
 *
 * CASE 1 – User ABC sees only ABC data              → PASS
 * CASE 2 – User Cafe Mộc does NOT see ABC data      → PASS
 * CASE 3 – Request without tenantId                 → 401
 * CASE 4 – Tenant Suspended                         → 403
 * CASE 5 – Cross-tenant access                      → 403/404
 * CASE 6 – Multi-tenant user can switch tenant      → PASS
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { Tenant, TenantStatus } from '../src/modules/tenant/entities/tenant.entity';

describe('Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tokenABC: string;
  let tokenCafe: string;
  let tenantABCId: string;
  let tenantCafeId: string;
  let customerABCId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);

    // Login as ABC
    const loginABC = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@abctrading.vn', password: 'Password123!' })
      .expect(200);

    tokenABC = loginABC.body.accessToken;
    tenantABCId = loginABC.body.user.tenantId;

    // Login as Cafe Mộc
    const loginCafe = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@cafemoc.vn', password: 'Password123!' })
      .expect(200);

    tokenCafe = loginCafe.body.accessToken;
    tenantCafeId = loginCafe.body.user.tenantId;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── CASE 1 ─────────────────────────────────────────────────
  it('CASE 1: User ABC sees only ABC customers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenABC}`);
    if (res.status !== 200) {
      console.error('\n===== CASE 1 ERROR =====');
      console.error(JSON.stringify(res.body, null, 2));
      console.error('=========================\n');
    }
    expect(res.status).toBe(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((c: any) => {
      expect(c.tenantId).toBe(tenantABCId);
    });
    customerABCId = res.body[0].id;
  });

  // ─── CASE 2 ─────────────────────────────────────────────────
  it('CASE 2: User Cafe Mộc does NOT see ABC data', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/customers')
      
      .set('Authorization', `Bearer ${tokenCafe}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((c: any) => {
      expect(c.tenantId).toBe(tenantCafeId);
      expect(c.tenantId).not.toBe(tenantABCId);
    });
  });

  // ─── CASE 3 ─────────────────────────────────────────────────
  it('CASE 3: Request without token → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/customers')
      .expect(401);
  });

  // ─── CASE 4 ─────────────────────────────────────────────────
  it('CASE 4: Inactive tenant → 403', async () => {
    const tenantRepo = dataSource.getRepository(Tenant);
    await tenantRepo.update(tenantCafeId, { status: TenantStatus.SUSPENDED });

    await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenCafe}`)
      .expect(403);

    // Restore
    await tenantRepo.update(tenantCafeId, { status: TenantStatus.ACTIVE });
  });

  // ─── CASE 5 ─────────────────────────────────────────────────
  it('CASE 5: Cross-tenant access by ID → 403/404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerABCId}`)
      .set('Authorization', `Bearer ${tokenCafe}`);

    expect([403, 404]).toContain(res.status);
  });

  // ─── CASE 6 ─────────────────────────────────────────────────
  it('CASE 6: Multi-tenant user can switch tenant', async () => {
    // Self-heal multi user membership on both tenants
    try {
      await dataSource.query(`
        UPDATE tenant_users tu
        SET status = 'active'
        FROM users u
        WHERE tu.user_id = u.id
          AND u.email = 'multi@businessos.vn'
          AND tu.status <> 'active'
      `);
    } catch {}
    // Login without tenant → should get requiresTenantSelection
    const multiLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'multi@businessos.vn', password: 'Password123!' })
      .expect(200);

    expect(multiLogin.body.requiresTenantSelection).toBe(true);
    expect(multiLogin.body.tenants.length).toBe(2);

    const abcTenant = multiLogin.body.tenants.find(
      (t: any) => t.code === 'ABC',
    );
    const cafeTenant = multiLogin.body.tenants.find(
      (t: any) => t.code === 'CAFE_MOC',
    );
    expect(abcTenant).toBeDefined();
    expect(cafeTenant).toBeDefined();

    // Login with explicit tenant ABC
    const loginABC = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'multi@businessos.vn',
        password: 'Password123!',
        tenant: 'ABC',
      })
      .expect(200);

    expect(loginABC.body.accessToken).toBeDefined();
    expect(loginABC.body.user.tenantId).toBe(abcTenant.tenantId);

    // Switch to Cafe Mộc
    const switched = await request(app.getHttpServer())
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${loginABC.body.accessToken}`)
      .send({ tenantId: cafeTenant.tenantId })
      .expect(200);

    expect(switched.body.accessToken).toBeDefined();
    expect(switched.body.user.tenantId).toBe(cafeTenant.tenantId);

    // Verify data isolation after switch
    const customers = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${switched.body.accessToken}`)
      .expect(200);

    customers.body.forEach((c: any) => {
      expect(c.tenantId).toBe(cafeTenant.tenantId);
    });
  });
});
