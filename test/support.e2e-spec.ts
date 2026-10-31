/**
 * Customer Support Center (A3) – e2e
 *
 * Requires seeded DB + migration 1749000000000.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Customer Support (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let ticketId: string;

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

  it('POST /support/tickets creates a ticket', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subject: 'Cannot access billing page',
        description: 'Getting 403 when opening the portal',
        priority: 'HIGH',
      });

    if (res.status !== 201) {
      console.error('[CREATE TICKET FAIL]', res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('OPEN');
    ticketId = res.body.id;
  });

  it('GET /support/tickets lists tickets', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /support/tickets/:id/reply adds a comment', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'We are looking into this.', isInternal: false });

    expect(res.status).toBe(201);
    expect(res.body.body).toContain('looking into');
  });

  it('POST /support/tickets/:id/close closes the ticket', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/close`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/support/tickets');
    expect(res.status).toBe(401);
  });
});
