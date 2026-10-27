/**
 * Administration Center – real e2e.
 *
 * Prerequisites: migration:run and seed (ABC tenant, admin + sales users).
 * These tests hit the running application against the configured database.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { EventLog } from '../src/modules/event/entities/event-log.entity';

describe('Administration Center (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;

  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    dataSource = app.get(DataSource);

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD, tenant: 'ABC' });
      if (!res.body.accessToken) {
        throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
      }
      return res.body.accessToken as string;
    };

    adminToken = await login('admin@abctrading.vn');
    salesToken = await login('hcm.user@abctrading.vn');
  });

  afterAll(async () => {
    await app?.close();
  });

  const admin = () => request(app.getHttpServer()).get('/api/v1/admin/users').set('Authorization', `Bearer ${adminToken}`);

  it('admin can list users', async () => {
    const res = await admin().expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('sales is forbidden', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
  });

  it('missing token is unauthorized', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
  });

  it('rejects a body field that is not whitelisted', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `reject.${Date.now()}@abctrading.vn`,
        fullName: 'Reject',
        password: 'Password123!',
        tenantId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(400);
  });

  it('creates a user and does not return a password hash', async () => {
    const email = `e2e.${Date.now()}@abctrading.vn`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, fullName: 'E2E User', password: 'Password123!', role: 'sales' })
      .expect(201);
    expect(res.body.email).toBe(email);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('lists api keys without keyHash', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain('keyHash');
    expect(blob).not.toContain('plainKey');
  });

  it('lists webhooks without secret', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain('"secret"');
  });

  it('enables a feature', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/features/sales/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.enabled).toBe(true);
  });

  it('rejects an http webhook url (requires step-up first)', async () => {
    // Without step-up token, StepUpGuard returns 412 before URL validation
    await request(app.getHttpServer())
      .post('/api/v1/admin/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', url: 'http://127.0.0.1/hook', events: ['SalesCreated'] })
      .expect(412);
  });

  it('writes an audit row and a UserCreated event when a user is created', async () => {
    const email = `audit.${Date.now()}@abctrading.vn`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, fullName: 'Audit Evidence', password: 'Password123!', role: 'sales' })
      .expect(201);

    const audit = await dataSource.getRepository(AuditLog).findOne({
      where: { entityType: 'user', entityId: created.body.id, action: 'CREATE' as any },
    });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit?.newData)).not.toContain('passwordHash');

    const event = await dataSource.getRepository(EventLog).findOne({
      where: { eventType: 'UserCreated', aggregateId: created.body.id },
    });
    expect(event).toBeTruthy();
    expect(event?.payload).toMatchObject({ email });
  });

  it('writes an audit row and a FeatureEnabled event', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/features/inventory/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const event = await dataSource.getRepository(EventLog).findOne({
      where: { eventType: 'FeatureEnabled' },
      order: { createdAt: 'DESC' },
    });
    expect(event).toBeTruthy();
    expect(event?.payload).toMatchObject({ featureCode: 'inventory' });

    const audit = await dataSource.getRepository(AuditLog).findOne({
      where: { entityType: 'feature', action: 'UPDATE' as any },
      order: { createdAt: 'DESC' },
    });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit?.newData)).toContain('inventory');
  });

  it('rejects the old token after the user is suspended', async () => {
    const email = `revoke.${Date.now()}@abctrading.vn`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, fullName: 'Revoke Me', password: 'Password123!', role: 'sales' })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123!', tenant: 'ABC' })
      .expect(200);
    const oldToken = login.body.accessToken as string;

    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
  });

  it('does not show or change another tenant', async () => {
    const cafeLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@cafemoc.vn', password: PASSWORD, tenant: 'CAFE_MOC' })
      .expect(200);
    const cafeToken = cafeLogin.body.accessToken as string;

    const abcUsers = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const cafeUsers = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${cafeToken}`)
      .expect(200);

    const abcEmails = abcUsers.body.map((u: { email: string }) => u.email);
    const cafeEmails = cafeUsers.body.map((u: { email: string }) => u.email);
    expect(cafeEmails).not.toContain('admin@abctrading.vn');
    expect(cafeEmails).toContain('owner@cafemoc.vn');

    const abcAdminId = abcUsers.body.find((u: { email: string }) => u.email === 'admin@abctrading.vn').id;
    await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${abcAdminId}`)
      .set('Authorization', `Bearer ${cafeToken}`)
      .expect(404);

    const before = await request(app.getHttpServer())
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${cafeToken}`)
      .send({ language: 'en' })
      .expect(200);
    const after = await request(app.getHttpServer())
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.language).toBe(before.body.language);
    expect(abcEmails.length).toBeGreaterThan(0);
  });

  it('rejects private and metadata webhook urls (requires step-up first)', async () => {
    // Step-up required before SSRF validation runs (412 = Precondition Failed)
    await request(app.getHttpServer())
      .post('/api/v1/admin/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Loopback', url: 'https://127.0.0.1/hook', events: ['SalesCreated'] })
      .expect(412);
    await request(app.getHttpServer())
      .post('/api/v1/admin/webhooks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Metadata', url: 'https://169.254.169.254/latest', events: ['SalesCreated'] })
      .expect(412);
  });

  it('returns a trace id and admin metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.body.requests).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('denied');
    expect(res.body).toHaveProperty('alerts');
  });
});

describe('Administration rate limit (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.ADMIN_MUTATE_LIMIT = '3';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@abctrading.vn', password: 'Password123!', tenant: 'ABC' })
      .expect(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.ADMIN_MUTATE_LIMIT;
    await app?.close();
  });

  it('returns 429 after the mutation limit', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ timezone: 'Asia/Ho_Chi_Minh' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ timezone: 'Asia/Ho_Chi_Minh' })
      .expect(429);
  });
});
