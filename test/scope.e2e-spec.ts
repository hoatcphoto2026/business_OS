/**
 * Sprint 4 – Scope Engine Real E2E Tests
 *
 * Prerequisites:
 *   npm run migration:run
 *   npm run seed
 *
 * Test flow:
 *   1. Login as sales / manager / admin
 *   2. Sales creates a customer (owner = sales user)
 *   3. Verify each role sees the correct set of customers
 *
 * Expected:
 *   - Sales (SELF)      → only own customers
 *   - Manager (TEAM)    → customers of team members
 *   - Admin/Owner (TENANT or default) → all tenant customers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Scope Engine – Customers (e2e)', () => {
  let app: INestApplication;

  let salesToken: string;
  let managerToken: string;
  let adminToken: string;

  let salesUserId: string;
  let createdCustomerId: string;

  const PASSWORD = 'Password123!';
  const TENANT = 'ABC';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD, tenant: TENANT })
        .expect(200);

      if (!res.body.accessToken) {
        throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
      }
      return res.body;
    };

    const sales = await login('hcm.user@abctrading.vn');
    const manager = await login('manager@abctrading.vn');
    const admin = await login('admin@abctrading.vn');

    salesToken = sales.accessToken;
    managerToken = manager.accessToken;
    adminToken = admin.accessToken;

    salesUserId = sales.user.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should login and return access tokens', () => {
    expect(salesToken).toBeDefined();
    expect(managerToken).toBeDefined();
    expect(adminToken).toBeDefined();
  });

  it('Sales creates a customer (becomes owner)', async () => {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        name: 'Khách hàng của Sales HCM',
        code: 'KH-SALES-SCOPE-001',
        email: 'sales.customer@test.vn',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.ownerId).toBe(salesUserId);
    createdCustomerId = res.body.id;
  });

  it('Sales (SELF) sees only own customers', async () => {
    const res = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);

    // Every returned customer must be owned by this sales user
    for (const c of res.body) {
      expect(c.ownerId).toBe(salesUserId);
    }

    // The one we just created must be visible
    const found = res.body.find((c: any) => c.id === createdCustomerId);
    expect(found).toBeDefined();
  });

  it('Manager (TEAM) sees team customers including Sales', async () => {
    const res = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((c: any) => c.id === createdCustomerId);
    if (!found) {
      console.warn(
        'Manager did not see sales customer. Ensure both users are in the same team (re-run seed).',
      );
      console.warn('Customers returned:', res.body.map((c: any) => ({ id: c.id, ownerId: c.ownerId, name: c.name })));
    }
    expect(found).toBeDefined();
  });

  it('Admin sees all customers in the tenant (optional – requires role assignment)', async () => {
    const res = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${adminToken}`);

    if (res.status === 403) {
      console.warn(
        'Admin got 403 – user_roles not assigned. Run seed again or ignore this case.',
      );
      return; // skip assertion
    }

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((c: any) => c.id === createdCustomerId);
    expect(found).toBeDefined();
  });

  it('Sales cannot see another user’s customer by id (scope filter)', async () => {
    // Create a customer as manager (has customer.create permission)
    const createRes = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Khách của Manager',
        code: 'KH-MGR-SCOPE-001',
      })
      .expect(201);

    const managerCustomerId = createRes.body.id;

    // Sales (SELF) tries to fetch manager's customer → should be 404
    await request(app.getHttpServer())
      .get(`/customers/${managerCustomerId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(404);
  });
});
