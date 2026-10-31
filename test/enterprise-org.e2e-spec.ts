/**
 * C2 Enterprise Organization Structure.
 * Requires migration:run and seed. No global prefix, same as the other e2e suites.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Enterprise Organization (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let adminId: string;
  let salesId: string;

  const PASSWORD = 'Password123!';
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const login = async (email: string, tenant: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      return res.body as { accessToken: string; user: { id: string } };
    };

    const admin = await login('admin@abctrading.vn', 'ABC');
    const sales = await login('hcm.user@abctrading.vn', 'ABC');
    const cafe = await login('owner@cafemoc.vn', 'CAFE_MOC');
    adminToken = admin.accessToken;
    salesToken = sales.accessToken;
    cafeToken = cafe.accessToken;
    adminId = admin.user.id;
    salesId = sales.user.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous and users without admin.access', async () => {
    await request(app.getHttpServer()).get('/org/organizations').expect(401);
    await request(app.getHttpServer())
      .get('/org/organizations')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
  });

  it('builds a multi-level org, moves a user, and reports cost centers', async () => {
    const root = await request(app.getHttpServer())
      .post('/org/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `ORG-${stamp}`, name: 'ABC Holdings' })
      .expect(201);

    const child = await request(app.getHttpServer())
      .post('/org/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `SUB-${stamp}`, name: 'ABC Retail', parentId: root.body.id })
      .expect(201);

    const finance = await request(app.getHttpServer())
      .post('/org/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationId: root.body.id, code: `FIN-${stamp}`, name: 'Finance' })
      .expect(201);

    const accounting = await request(app.getHttpServer())
      .post('/org/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        organizationId: root.body.id,
        parentId: finance.body.id,
        code: `ACC-${stamp}`,
        name: 'Accounting',
      })
      .expect(201);

    const center = await request(app.getHttpServer())
      .post('/org/cost-centers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        organizationId: root.body.id,
        departmentId: accounting.body.id,
        code: `CC-${stamp}`,
        name: 'Accounting CC',
      })
      .expect(201);

    const team = await request(app.getHttpServer())
      .post('/org/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId: accounting.body.id, code: `LED-${stamp}`, name: 'Ledger' })
      .expect(201);

    const otherTeam = await request(app.getHttpServer())
      .post('/org/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId: finance.body.id, code: `PAY-${stamp}`, name: 'Payroll' })
      .expect(201);

    const membership = await request(app.getHttpServer())
      .post('/org/memberships')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        organizationId: root.body.id,
        userId: salesId,
        role: 'MEMBER',
        departmentId: accounting.body.id,
        teamId: team.body.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/org/departments/${finance.body.id}/manager`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: adminId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/org/teams/${team.body.id}/lead`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: salesId })
      .expect(201);

    const moved = await request(app.getHttpServer())
      .post(`/org/memberships/${membership.body.id}/move`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId: finance.body.id, teamId: otherTeam.body.id })
      .expect(201);
    expect(moved.body.departmentId).toBe(finance.body.id);
    expect(moved.body.teamId).toBe(otherTeam.body.id);

    const tree = await request(app.getHttpServer())
      .get('/org/tree')
      .query({ organizationId: root.body.id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(tree.body.children.map((row: { id: string }) => row.id)).toContain(child.body.id);
    const financeNode = tree.body.departments.find((row: { id: string }) => row.id === finance.body.id);
    expect(financeNode.managerId).toBe(adminId);
    expect(financeNode.children.map((row: { id: string }) => row.id)).toContain(accounting.body.id);
    expect(financeNode.teams[0].users.map((row: { userId: string }) => row.userId)).toContain(salesId);

    const stats = await request(app.getHttpServer())
      .get('/org/statistics')
      .query({ organizationId: root.body.id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stats.body.organizations).toBeGreaterThanOrEqual(2);
    expect(stats.body.departments).toBeGreaterThanOrEqual(2);
    expect(stats.body.teams).toBeGreaterThanOrEqual(2);
    expect(stats.body.members).toBeGreaterThanOrEqual(1);

    const report = await request(app.getHttpServer())
      .get('/org/cost-centers/report')
      .query({ organizationId: root.body.id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = report.body.costCenters.find((item: { id: string }) => item.id === center.body.id);
    expect(row.code).toBe(`CC-${stamp}`);
    expect(row.departmentCount).toBeGreaterThanOrEqual(1);

    const metrics = await request(app.getHttpServer())
      .get('/org/metrics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(metrics.text).toContain('org_units_created_total');
    expect(metrics.text).toContain('org_users_moved_total');

    await request(app.getHttpServer())
      .get('/org/tree')
      .query({ organizationId: root.body.id })
      .set('Authorization', `Bearer ${cafeToken}`)
      .expect(404);
  });
});
