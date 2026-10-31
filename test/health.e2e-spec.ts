/**
 * Health probes + security hardening (e2e).
 * - /health, /health/ready are public and excluded from the global prefix
 * - POST /auth/login has a stricter per-IP limit (10 / minute)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health & security hardening (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health returns 200 without authentication', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBeDefined();
  });

  it('GET /health/ready reports the database as up', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.db).toBe('up');
  });

  it('POST /auth/login is throttled after 10 attempts per minute', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'bruteforce@test.local',
          password: 'wrong-password',
          tenant: 'ABC',
        });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});
