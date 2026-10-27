/**
 * Sprint 5 – Audit Log integration tests.
 *
 * Prerequisites:
 *   npm run migration:run
 *   npm run seed
 *
 * The HTTP app in tests has no global prefix (same as the other e2e suites).
 * Production prefix is /api/v1.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Audit Log foundation (e2e)', () => {
  let app: INestApplication;
  let salesToken: string;
  let managerToken: string;
  let adminToken: string;
  let cafeToken: string;
  let salesUserId: string;

  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = async (email: string, tenant: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      if (!res.body.accessToken) {
        throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
      }
      return res.body;
    };

    const sales = await login('hcm.user@abctrading.vn', 'ABC');
    const manager = await login('manager@abctrading.vn', 'ABC');
    const admin = await login('admin@abctrading.vn', 'ABC');
    const cafe = await login('owner@cafemoc.vn', 'CAFE_MOC');

    salesToken = sales.accessToken;
    managerToken = manager.accessToken;
    adminToken = admin.accessToken;
    cafeToken = cafe.accessToken;
    salesUserId = sales.user.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('CASE 1-3-6 customer timeline and CASE 4-5 scope', async () => {
    const code = `KH001-${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Cafe Mộc', code, email: 'kh001@test.vn' })
      .expect(201);

    const customerId = created.body.id as string;
    expect(created.body.ownerId).toBe(salesUserId);

    const updated = await request(app.getHttpServer())
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Cafe Mộc Premium' })
      .expect(200);
    expect(updated.body.name).toBe('Cafe Mộc Premium');

    await request(app.getHttpServer())
      .delete(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);

    const history = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'customer', entity_id: customerId })
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);

    expect(history.body.map((row: { action: string }) => row.action)).toEqual([
      'CREATE',
      'UPDATE',
      'DELETE',
    ]);

    const update = history.body.find((row: { action: string }) => row.action === 'UPDATE');
    expect(update.oldData).toEqual({ name: 'Cafe Mộc' });
    expect(update.newData).toEqual({ name: 'Cafe Mộc Premium' });
    expect(history.body[0].oldData).toBeNull();
    expect(history.body[2].newData).toBeNull();
    expect(history.body[2].oldData.name).toBe('Cafe Mộc Premium');

    const managerView = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'customer', entity_id: customerId })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(managerView.body).toHaveLength(3);

    const adminView = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'customer', entity_id: customerId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminView.body).toHaveLength(3);

    // CASE 4 — other tenant, even with the entity id, sees nothing.
    const cafeView = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'customer', entity_id: customerId })
      .set('Authorization', `Bearer ${cafeToken}`)
      .expect(200);
    expect(cafeView.body).toEqual([]);

    // CASE 5 — a customer owned by the manager is outside sales SELF scope.
    const outsider = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Khách của Manager', code: `KH-MGR-${Date.now()}` })
      .expect(201);

    const salesAudit = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'customer', entity_id: outsider.body.id })
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);
    expect(salesAudit.body).toEqual([]);

    const managerAudit = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'customer', entity_id: outsider.body.id })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(managerAudit.body.map((row: { action: string }) => row.action)).toContain('CREATE');
  });
});
