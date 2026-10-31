/**
 * Workflow Engine (B1) – e2e
 *
 * Requires migration 1752000000000 + seeded admin.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Workflow Engine (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let workflowId: string;

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

  it('POST /workflows creates a definition', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/workflow-definitions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'INVOICE_NOTIFY',
        name: 'Invoice Created → Notify',
        type: 'EVENT_DRIVEN',
        nodes: [
          { code: 'start', name: 'Start', nodeType: 'START', isStart: true },
          { code: 'notify', name: 'Send Notification', nodeType: 'ACTION', actionType: 'SEND_NOTIFICATION' },
          { code: 'end', name: 'End', nodeType: 'END' },
        ],
        transitions: [
          { fromCode: 'start', toCode: 'notify' },
          { fromCode: 'notify', toCode: 'end' },
        ],
      });

    if (res.status !== 201) {
      console.error('[CREATE WF FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.code).toBe('INVOICE_NOTIFY');
    workflowId = res.body.id;
  });

  it('GET /workflows lists definitions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/workflow-definitions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /workflows/:id/execute runs the workflow', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ input: { invoiceNumber: 'INV-TEST' } });

    if (res.status !== 200) {
      console.error('[EXECUTE FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  it('GET /workflows/executions lists executions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/workflow-definitions/executions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/workflow-definitions');
    expect(res.status).toBe(401);
  });
});
