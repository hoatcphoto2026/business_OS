/**
 * Sprint 9 – Business Copilot Runtime (e2e)
 *
 * Prerequisites:
 *   npm run migration:run
 *   npm run seed
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Business Copilot Runtime (e2e)', () => {
  let app: INestApplication;
  let salesToken: string;
  let adminToken: string;
  let cafeToken: string;

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
      return res.body;
    };

    const sales = await login('hcm.user@abctrading.vn', 'ABC');
    const admin = await login('admin@abctrading.vn', 'ABC');
    const cafe = await login('owner@cafemoc.vn', 'CAFE_MOC');

    salesToken = sales.accessToken;
    adminToken = admin.accessToken;
    cafeToken = cafe.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('CASE 7: Copilot disabled → 403', async () => {
    // Disable both class-level and method-level features
    await request(app.getHttpServer())
      .post('/tenant-features/business_copilot/disable')
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app.getHttpServer())
      .post('/tenant-features/business_copilot_ai/disable')
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Khách nào nợ nhiều nhất?' });

    expect(res.status).toBe(403);
  });

  it('CASE 1-4: ask intents after enable', async () => {
    await request(app.getHttpServer())
      .post('/tenant-features/business_copilot_ai/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // Create some data
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Khách nợ lớn', code: `KH-CP-${Date.now()}` })
      .expect(201);

    await request(app.getHttpServer())
      .post('/sales-orders')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        orderNumber: `SO-CP-${Date.now()}`,
        customerId: customer.body.id,
        orderDate: new Date().toISOString().slice(0, 10),
        totalAmount: 25000000,
      })
      .expect(201);

    // CASE 1 – top debt
    const debt = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Khách nào nợ nhiều nhất?' })
      .expect(201);
    expect(debt.body.intent).toBe('top_debt_customer');
    expect(debt.body.answer).toHaveProperty('customer');
    expect(debt.body.generatedAt).toBeTruthy();

    // CASE 2 – revenue this month
    const rev = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Doanh thu tháng này?' })
      .expect(201);
    expect(rev.body.intent).toBe('revenue_this_month');
    expect(rev.body.answer).toHaveProperty('revenue');

    // CASE 3 – pending workflows
    const pending = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Có bao nhiêu workflow đang chờ duyệt?' })
      .expect(201);
    expect(pending.body.intent).toBe('pending_workflows');
    expect(pending.body.answer).toHaveProperty('pendingWorkflows');

    // CASE 4 – recent audit
    const audit = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Ai vừa sửa khách hàng?' })
      .expect(201);
    expect(audit.body.intent).toBe('recent_audit_logs');
    expect(audit.body.answer).toHaveProperty('items');
  });

  it('CASE 5 + 6: scope respected (SELF vs TENANT)', async () => {
    // Sales (SELF) customer count
    const selfCount = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Có bao nhiêu khách hàng?' })
      .expect(201);
    expect(selfCount.body.intent).toBe('customer_count');
    expect(selfCount.body.answer.scope).toBe('SELF');

    // Admin (TENANT) customer count
    const adminCount = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'Có bao nhiêu khách hàng?' })
      .expect(201);
    expect(adminCount.body.intent).toBe('customer_count');
    expect(['TENANT', 'COMPANY', 'BRANCH']).toContain(adminCount.body.answer.scope);
    expect(adminCount.body.answer.customerCount).toBeGreaterThanOrEqual(
      selfCount.body.answer.customerCount,
    );
  });

  it('dashboard + analyze + recommend', async () => {
    // Ensure base feature is enabled
    await request(app.getHttpServer())
      .post('/tenant-features/business_copilot/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const dash = await request(app.getHttpServer())
      .get('/copilot/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(dash.body).toHaveProperty('pendingWorkflows');
    expect(dash.body).toHaveProperty('recentEvents');

    const analyze = await request(app.getHttpServer())
      .post('/copilot/analyze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ analysisType: 'business-health' })
      .expect(201);
    expect(analyze.body).toHaveProperty('revenueTrend');

    const rec = await request(app.getHttpServer())
      .post('/copilot/recommend')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(Array.isArray(rec.body.recommendations)).toBe(true);
  });

  it('Cafe tenant without feature still blocked', async () => {
    await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${cafeToken}`)
      .send({ question: 'Doanh thu tháng này?' })
      .expect(403);
  });
});
