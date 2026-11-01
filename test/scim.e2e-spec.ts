import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  SCIM_GROUP_EXT,
  SCIM_GROUP_SCHEMA,
  SCIM_PATCH,
  SCIM_USER_SCHEMA,
} from '../src/modules/scim/enums/scim.enum';

describe('SCIM 2.0 provisioning (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let cafeToken: string;
  let token: string;
  let endpointId: string;

  const stamp = Date.now();
  const organizationCode = `SCIM-ORG-${stamp}`;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    const login = async (email: string, tenant: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Password123!', tenant })
        .expect(200);
      return res.body.accessToken as string;
    };
    adminToken = await login('admin@abctrading.vn', 'ABC');
    cafeToken = await login('owner@cafemoc.vn', 'CAFE_MOC');

    const created = await request(app.getHttpServer())
      .post('/scim/endpoints')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `HR SCIM ${stamp}`,
        defaultRole: 'member',
        organizationCode,
      })
      .expect(201);
    token = created.body.token;
    endpointId = created.body.id;
    expect(token).toEqual(expect.any(String));
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createUser(email: string, roles?: Array<{ value: string }>) {
    const res = await request(app.getHttpServer())
      .post('/scim/v2/Users')
      .set(auth())
      .send({
        schemas: [SCIM_USER_SCHEMA],
        userName: email,
        name: { formatted: 'SCIM User' },
        active: true,
        ...(roles ? { roles } : {}),
      })
      .expect(201);
    return res.body as { id: string; userName: string; active: boolean };
  }

  async function internalUserId(email: string): Promise<string> {
    const rows = await dataSource.query('SELECT id FROM users WHERE email = $1', [email]);
    return rows[0].id as string;
  }

  it('requires a valid bearer token and honours disabled endpoints', async () => {
    await request(app.getHttpServer()).get('/scim/v2/Users').expect(401);
    await request(app.getHttpServer())
      .get('/scim/v2/Users')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/scim/endpoints/${endpointId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false })
      .expect(200);
    await request(app.getHttpServer())
      .get('/scim/v2/Users')
      .set(auth())
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/scim/endpoints/${endpointId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true })
      .expect(200);
    await request(app.getHttpServer()).get('/scim/v2/Users').set(auth()).expect(200);
  });

  it('exposes ServiceProviderConfig and ResourceTypes', async () => {
    const config = await request(app.getHttpServer())
      .get('/scim/v2/ServiceProviderConfig')
      .set(auth())
      .expect(200);
    expect(config.body.patch.supported).toBe(true);
    expect(config.body.filter.maxResults).toBe(200);

    const types = await request(app.getHttpServer())
      .get('/scim/v2/ResourceTypes')
      .set(auth())
      .expect(200);
    expect(types.body.Resources.map((row: { name: string }) => row.name)).toEqual([
      'User',
      'Group',
    ]);
  });

  it('creates, reads, filters, updates and deletes a user', async () => {
    const email = `scim-${stamp}@example.com`;
    const created = await createUser(email, [{ value: 'sales' }]);
    expect(created.userName).toBe(email);
    expect(created.active).toBe(true);

    await request(app.getHttpServer())
      .get(`/scim/v2/Users/${created.id}`)
      .set(auth())
      .expect(200);

    const filtered = await request(app.getHttpServer())
      .get('/scim/v2/Users')
      .query({ filter: `userName eq "${email}"` })
      .set(auth())
      .expect(200);
    expect(filtered.body.totalResults).toBe(1);
    expect(filtered.body.Resources[0].id).toBe(created.id);

    await request(app.getHttpServer())
      .get('/scim/v2/Users')
      .query({ filter: 'unknown eq "x"' })
      .set(auth())
      .expect(400);

    const replaced = await request(app.getHttpServer())
      .put(`/scim/v2/Users/${created.id}`)
      .set(auth())
      .send({
        schemas: [SCIM_USER_SCHEMA],
        userName: email,
        displayName: 'Renamed User',
        active: true,
      })
      .expect(200);
    expect(replaced.body.displayName).toBe('Renamed User');

    await request(app.getHttpServer())
      .delete(`/scim/v2/Users/${created.id}`)
      .set(auth())
      .expect(204);
    await request(app.getHttpServer())
      .get(`/scim/v2/Users/${created.id}`)
      .set(auth())
      .expect(404);
  });

  it('suspends and reactivates a user, and maps roles automatically', async () => {
    const email = `suspend-${stamp}@example.com`;
    const created = await createUser(email, [{ value: 'manager' }]);

    const rows = await dataSource.query(
      `SELECT u.id, tu.role, tu.status FROM users u
         JOIN tenant_users tu ON tu.user_id = u.id
        WHERE u.email = $1`,
      [email],
    );
    expect(rows[0].role).toBe('manager');
    expect(rows[0].status).toBe('active');
    const roles = await dataSource.query(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [rows[0].id],
    );
    expect(roles.map((row: { code: string }) => row.code)).toContain('manager');

    const suspended = await request(app.getHttpServer())
      .patch(`/scim/v2/Users/${created.id}`)
      .set(auth())
      .send({
        schemas: [SCIM_PATCH],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      })
      .expect(200);
    expect(suspended.body.active).toBe(false);

    const afterSuspend = await dataSource.query(
      `SELECT tu.status FROM tenant_users tu JOIN users u ON u.id = tu.user_id WHERE u.email = $1`,
      [email],
    );
    expect(afterSuspend[0].status).toBe('suspended');

    const reactivated = await request(app.getHttpServer())
      .patch(`/scim/v2/Users/${created.id}`)
      .set(auth())
      .send({
        schemas: [SCIM_PATCH],
        Operations: [{ op: 'replace', value: { active: true } }],
      })
      .expect(200);
    expect(reactivated.body.active).toBe(true);

    await request(app.getHttpServer())
      .patch(`/scim/v2/Users/${created.id}`)
      .set(auth())
      .send({
        schemas: [SCIM_PATCH],
        Operations: [{ op: 'replace', path: 'nickName', value: 'x' }],
      })
      .expect(400);
  });


  it('syncs organizations, departments and group members', async () => {
    const first = await createUser(`group-a-${stamp}@example.com`);
    const second = await createUser(`group-b-${stamp}@example.com`);
    const firstInternal = await internalUserId(`group-a-${stamp}@example.com`);

    const organization = await request(app.getHttpServer())
      .post('/scim/v2/Groups')
      .set(auth())
      .send({
        schemas: [SCIM_GROUP_SCHEMA, SCIM_GROUP_EXT],
        displayName: 'SCIM Organization',
        externalId: organizationCode,
        [SCIM_GROUP_EXT]: { syncTarget: 'ORGANIZATION', organizationCode },
      })
      .expect(201);
    expect(organization.body[SCIM_GROUP_EXT].organizationId).toBeDefined();

    const orgRows = await dataSource.query(
      `SELECT id, code, name FROM enterprise_organizations WHERE code = $1`,
      [organizationCode],
    );
    expect(orgRows).toHaveLength(1);

    const department = await request(app.getHttpServer())
      .post('/scim/v2/Groups')
      .set(auth())
      .send({
        schemas: [SCIM_GROUP_SCHEMA, SCIM_GROUP_EXT],
        displayName: `Sales ${stamp}`,
        externalId: `dept-${stamp}`,
        members: [{ value: first.id }],
        [SCIM_GROUP_EXT]: { syncTarget: 'DEPARTMENT', organizationCode },
      })
      .expect(201);
    const departmentId = department.body[SCIM_GROUP_EXT].departmentId;
    expect(departmentId).toBeDefined();

    const deptRows = await dataSource.query(
      `SELECT id, name, status FROM enterprise_departments WHERE id = $1`,
      [departmentId],
    );
    expect(deptRows[0].status).toBe('active');

    const membership = await dataSource.query(
      `SELECT department_id FROM org_memberships WHERE organization_id = $1 AND user_id = $2`,
      [orgRows[0].id, firstInternal],
    );
    expect(membership[0].department_id).toBe(departmentId);

    const fetched = await request(app.getHttpServer())
      .get(`/scim/v2/Groups/${department.body.id}`)
      .set(auth())
      .expect(200);
    expect(fetched.body.members).toHaveLength(1);

    const added = await request(app.getHttpServer())
      .patch(`/scim/v2/Groups/${department.body.id}`)
      .set(auth())
      .send({
        schemas: [SCIM_PATCH],
        Operations: [{ op: 'add', path: 'members', value: [{ value: second.id }] }],
      })
      .expect(200);
    expect(added.body.members).toHaveLength(2);

    const removed = await request(app.getHttpServer())
      .patch(`/scim/v2/Groups/${department.body.id}`)
      .set(auth())
      .send({
        schemas: [SCIM_PATCH],
        Operations: [{ op: 'remove', path: 'members', value: [{ value: first.id }] }],
      })
      .expect(200);
    expect(removed.body.members).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/scim/v2/Groups/${department.body.id}`)
      .set(auth())
      .expect(204);
    await request(app.getHttpServer())
      .get(`/scim/v2/Groups/${department.body.id}`)
      .set(auth())
      .expect(404);

    const deptAfter = await dataSource.query(
      `SELECT status FROM enterprise_departments WHERE id = $1`,
      [departmentId],
    );
    expect(deptAfter[0].status).toBe('inactive');
  });

  it('syncs plain groups into the endpoint organization', async () => {
    const user = await createUser(`plain-${stamp}@example.com`);
    const userInternal = await internalUserId(`plain-${stamp}@example.com`);

    const group = await request(app.getHttpServer())
      .post('/scim/v2/Groups')
      .set(auth())
      .send({
        schemas: [SCIM_GROUP_SCHEMA],
        displayName: `Everyone ${stamp}`,
        members: [{ value: user.id }],
      })
      .expect(201);
    expect(group.body[SCIM_GROUP_EXT].syncTarget).toBeNull();

    const orgRows = await dataSource.query(
      `SELECT id FROM enterprise_organizations WHERE code = $1`,
      [organizationCode],
    );
    const rows = await dataSource.query(
      `SELECT department_id FROM org_memberships WHERE organization_id = $1 AND user_id = $2`,
      [orgRows[0].id, userInternal],
    );
    expect(rows).toHaveLength(1);
  });


  it('tracks provisioning status, retries failures and dead-letters them', async () => {
    await request(app.getHttpServer())
      .post('/scim/v2/Groups')
      .set(auth())
      .send({
        schemas: [SCIM_GROUP_SCHEMA, SCIM_GROUP_EXT],
        displayName: 'Broken department',
        externalId: `broken-${stamp}`,
        [SCIM_GROUP_EXT]: {
          syncTarget: 'DEPARTMENT',
          organizationCode: `MISSING-${stamp}`,
        },
      })
      .expect(400);

    const failed = await request(app.getHttpServer())
      .get('/scim/provisioning-logs')
      .query({ status: 'FAILED' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const log = failed.body.find(
      (row: { operation: string }) => row.operation === 'DEPARTMENT_SYNC',
    ) as { id: string; attempts: number; status: string };
    expect(log).toBeDefined();
    expect(log.attempts).toBe(1);

    const firstRetry = await request(app.getHttpServer())
      .post(`/scim/provisioning-logs/${log.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(firstRetry.body.attempts).toBe(2);
    expect(firstRetry.body.status).toBe('FAILED');

    const secondRetry = await request(app.getHttpServer())
      .post(`/scim/provisioning-logs/${log.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(secondRetry.body.attempts).toBe(3);
    expect(secondRetry.body.status).toBe('DEAD');
    expect(secondRetry.body.deadLetterAt).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/scim/provisioning-logs/${log.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    const dead = await request(app.getHttpServer())
      .get('/scim/provisioning-logs')
      .query({ status: 'DEAD' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(dead.body.some((row: { id: string }) => row.id === log.id)).toBe(true);
  });

  it('exposes provisioning metrics', async () => {
    const metrics = await request(app.getHttpServer())
      .get('/scim/metrics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(metrics.text).toContain('scim_provisioning_success_total');
    expect(metrics.text).toContain('scim_provisioning_dead_total');
    expect(metrics.text).toContain('scim_provisioning_max_attempts');
  });

  it('isolates tenants and never leaks endpoint tokens', async () => {
    const user = await createUser(`isolated-${stamp}@example.com`);

    const cafeEndpoint = await request(app.getHttpServer())
      .post('/scim/endpoints')
      .set('Authorization', `Bearer ${cafeToken}`)
      .send({ name: `Cafe SCIM ${stamp}`, organizationCode: `CAFE-${stamp}` })
      .expect(201);
    const cafeScimToken = cafeEndpoint.body.token as string;

    await request(app.getHttpServer())
      .get(`/scim/v2/Users/${user.id}`)
      .set({ Authorization: `Bearer ${cafeScimToken}` })
      .expect(404);

    const cafeList = await request(app.getHttpServer())
      .get('/scim/v2/Users')
      .set({ Authorization: `Bearer ${cafeScimToken}` })
      .expect(200);
    expect(cafeList.body.totalResults).toBe(0);

    const endpoints = await request(app.getHttpServer())
      .get('/scim/endpoints')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(endpoints.body.length).toBeGreaterThanOrEqual(1);
    expect(
      endpoints.body.every((row: { token?: string }) => row.token === undefined),
    ).toBe(true);
  });
});

