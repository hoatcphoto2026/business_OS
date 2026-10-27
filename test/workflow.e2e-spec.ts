/**
 * Sprint 6 – Workflow Engine Foundation (e2e)
 *
 * Prerequisites:
 *   npm run migration:run
 *   npm run seed
 *
 * Tests the generic workflow for Sales Orders (Phase 1).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Workflow Engine foundation (e2e)', () => {
  let app: INestApplication;
  let salesToken: string;
  let managerToken: string;

  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    try {
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
        return res.body;
      };

      const sales = await login('hcm.user@abctrading.vn', 'ABC');
      const manager = await login('manager@abctrading.vn', 'ABC');

      salesToken = sales.accessToken;
      managerToken = manager.accessToken;
    } catch (err) {
      // Surface the real bootstrap / login error clearly
      console.error('\n=== WORKFLOW E2E BOOTSTRAP FAILED ===');
      console.error(err);
      console.error('=====================================\n');
      throw err;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('CASE 1-6: full sales order workflow + history + audit + RBAC', async () => {
    // Create a customer first (sales_orders.customer_id is NOT NULL + FK)
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        name: 'Khách test workflow',
        code: `KH-WF-${Date.now()}`,
      })
      .expect(201);

    const customerId = customer.body.id as string;

    // Create Sales Order (starts as DRAFT + workflow instance)
    const created = await request(app.getHttpServer())
      .post('/sales-orders')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        orderNumber: `SO-${Date.now()}`,
        customerId,
        orderDate: new Date().toISOString().slice(0, 10),
        totalAmount: 1500000,
      })
      .expect(201);

    const orderId = created.body.id as string;
    const workflowId = created.body.workflowId as string;
    expect(created.body.status).toBe('DRAFT');
    expect(workflowId).toBeTruthy();

    // CASE 1: Submit
    const submitted = await request(app.getHttpServer())
      .post(`/workflows/${workflowId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ comment: 'Ready for approval' })
      .expect(201);
    expect(submitted.body.currentStatus).toBe('PENDING');

    // CASE 3: Sales tries to Approve → 403
    await request(app.getHttpServer())
      .post(`/workflows/${workflowId}/approve`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ comment: 'Trying to self-approve' })
      .expect(403);

    // CASE 2: Manager Approve
    const approved = await request(app.getHttpServer())
      .post(`/workflows/${workflowId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: 'Approved by manager' })
      .expect(201);
    expect(approved.body.currentStatus).toBe('APPROVED');

    // CASE 4: Post
    const posted = await request(app.getHttpServer())
      .post(`/workflows/${workflowId}/post`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: 'Posted to ledger' })
      .expect(201);
    expect(posted.body.currentStatus).toBe('POSTED');

    // CASE 5: History timeline
    const history = await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/history`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);

    const actions = history.body.map((h: { action: string }) => h.action);
    expect(actions).toContain('SUBMIT');
    expect(actions).toContain('APPROVE');
    expect(actions).toContain('POST');
    expect(history.body.length).toBeGreaterThanOrEqual(3);

    // CASE 6: Audit log contains the workflow actions
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'sales_order', entity_id: orderId })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const auditActions = audit.body.map((a: { action: string }) => a.action);
    expect(auditActions).toEqual(
      expect.arrayContaining(['CREATE', 'SUBMIT', 'APPROVE', 'POST']),
    );
  });
});
