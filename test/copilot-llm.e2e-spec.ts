/**
 * Sprint 10 – LLM Integration Layer (e2e)
 *
 * Uses MockProvider by default (AI_PROVIDER=mock).
 * Prerequisites: npm run migration:run && npm run seed
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('LLM Integration Layer (e2e)', () => {
  let app: INestApplication;
  let salesToken: string;
  let adminToken: string;
  let dataSource: DataSource;

  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = app.get(DataSource);

    const login = async (email: string, tenant: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      return res.body;
    };

    const sales = await login('hcm.user@abctrading.vn', 'ABC');
    const admin = await login('admin@abctrading.vn', 'ABC');
    salesToken = sales.accessToken;
    adminToken = admin.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('CASE 6: AI feature disabled → 403', async () => {
    await request(app.getHttpServer())
      .post('/tenant-features/business_copilot_ai/disable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Khách nào nợ nhiều nhất?' })
      .expect(403);
  });

  it('CASE 1 + 2 + 4 + 7: LLM intent + top debt + SELF scope + copilot log', async () => {
    await request(app.getHttpServer())
      .post('/tenant-features/business_copilot/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/tenant-features/business_copilot_ai/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Khách nợ LLM', code: `KH-LLM-${Date.now()}` })
      .expect(201);

    await request(app.getHttpServer())
      .post('/sales-orders')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        orderNumber: `SO-LLM-${Date.now()}`,
        customerId: customer.body.id,
        orderDate: new Date().toISOString().slice(0, 10),
        totalAmount: 18000000,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Khách nào nợ nhiều nhất?' })
      .expect(201);

    // CASE 1 – LLM classified intent
    expect(res.body.intent).toBe('top_debt_customer');
    // CASE 2 – answer has customer
    expect(res.body.answer).toHaveProperty('customer');
    expect(res.body.answer).toHaveProperty('summary');
    // CASE 4 – SELF scope
    expect(res.body.answer.scope).toBe('SELF');

    // CASE 7 – copilot log written
    const logs = await dataSource.query(
      `SELECT * FROM copilot_logs WHERE intent = 'top_debt_customer' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].provider).toBe('mock');
  });

  it('CASE 3: CEO Summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/copilot/ceo-summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('summary');
    expect(Array.isArray(res.body.highlights)).toBe(true);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.provider).toBe('mock');
  });

  it('CASE 5: Admin TENANT sees broader customer count', async () => {
    const selfRes = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ question: 'Có bao nhiêu khách hàng?' })
      .expect(201);
    expect(selfRes.body.answer.scope).toBe('SELF');

    const adminRes = await request(app.getHttpServer())
      .post('/copilot/ask')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'Có bao nhiêu khách hàng?' })
      .expect(201);
    expect(['TENANT', 'COMPANY', 'BRANCH']).toContain(adminRes.body.answer.scope);
    expect(adminRes.body.answer.customerCount).toBeGreaterThanOrEqual(
      selfRes.body.answer.customerCount,
    );
  });
});
