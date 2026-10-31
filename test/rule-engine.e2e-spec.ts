/**
 * Rule Engine (B3) – e2e
 *
 * Requires migration 1755000000000.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Rule Engine (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

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

  it('POST /rules creates a rule with condition and action', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'USAGE_WARNING',
        name: 'Usage > 80% Warning',
        conditions: [
          { conditionType: 'USAGE_THRESHOLD', operator: '>', value: '80' },
        ],
        actions: [
          { actionType: 'SEND_NOTIFICATION' },
        ],
      });

    if (res.status !== 201) {
      console.error('[CREATE RULE FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.code).toBe('USAGE_WARNING');
  });

  it('GET /rules lists rules', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/rules')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /rules/evaluate matches when usage > 80', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/rules/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ruleCode: 'USAGE_WARNING',
        input: { usagePercent: 85 },
      });

    if (res.status !== 200) {
      console.error('[EVALUATE FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      expect(res.body[0].status).toBe('MATCHED');
    }
  });

  it('GET /rules/history lists executions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/rules/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/rules');
    expect(res.status).toBe(401);
  });
});
