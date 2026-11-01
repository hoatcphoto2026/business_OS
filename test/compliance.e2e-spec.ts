/**
 * C5 Compliance Center.
 * Requires migration:run and seed. No global prefix, same as other e2e suites.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Compliance Center (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let evidenceCode: string;
  let riskId: string;

  const PASSWORD = 'Password123!';
  const stamp = Date.now();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      return res.body.accessToken as string;
    };
    adminToken = await login('admin@abctrading.vn', 'ABC');
    salesToken = await login('hcm.user@abctrading.vn', 'ABC');
    cafeToken = await login('owner@cafemoc.vn', 'CAFE_MOC');

    const rows = await dataSource.query(
      "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
    );
    abcTenantId = rows[0].id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects anonymous and users without admin.access', async () => {
    await request(app.getHttpServer()).get('/compliance/dashboard').expect(401);
    await request(app.getHttpServer())
      .get('/compliance/dashboard')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/compliance/risks')
      .set(auth(salesToken))
      .send({ title: 'nope', category: 'SECURITY', severity: 'LOW' })
      .expect(403);
  });

  it('collects evidence with integrity hashes and verifies it', async () => {
    const collected = await request(app.getHttpServer())
      .post('/compliance/evidence/collect')
      .set(auth(adminToken))
      .send({ categories: ['AUDIT', 'ACCESS', 'SECURITY', 'OPERATIONS'] })
      .expect(200);
    expect(collected.body).toHaveLength(4);
    for (const row of collected.body) {
      expect(row.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.status).toBe('COLLECTED');
      expect(row.tenantId).toBe(abcTenantId);
    }

    evidenceCode = `POLICY-${stamp}`;
    const created = await request(app.getHttpServer())
      .post('/compliance/evidence')
      .set(auth(adminToken))
      .send({
        code: evidenceCode,
        title: 'Access control policy',
        category: 'SECURITY',
        payload: { policy: 'AC-1', owner: 'security@abctrading.vn' },
        notes: 'Signed by CISO',
      })
      .expect(201);
    expect(created.body.hash).toMatch(/^[a-f0-9]{64}$/);

    await request(app.getHttpServer())
      .post('/compliance/evidence')
      .set(auth(adminToken))
      .send({ code: evidenceCode, title: 'Duplicate', category: 'SECURITY' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/compliance/evidence')
      .set(auth(adminToken))
      .send({ code: `BAD-${stamp}`, title: 'Bad category', category: 'NOPE' })
      .expect(400);

    const verified = await request(app.getHttpServer())
      .post(`/compliance/evidence/${created.body.id}/verify`)
      .set(auth(adminToken))
      .send({ notes: 'Reviewed by compliance' })
      .expect(200);
    expect(verified.body.status).toBe('VERIFIED');

    const list = await request(app.getHttpServer())
      .get('/compliance/evidence?category=SECURITY')
      .set(auth(adminToken))
      .expect(200);
    const codes = list.body.map((row: { code: string }) => row.code);
    expect(codes).toContain(evidenceCode);
    expect(codes).toContain(`SECURITY-${new Date().toISOString().slice(0, 10)}`);

    const auditRows = await dataSource.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE tenant_id = $1 AND entity_type = 'compliance_evidence'`,
      [abcTenantId],
    );
    expect(auditRows[0].n).toBeGreaterThan(0);
  });

  it('exports evidence as CSV, Excel and PDF', async () => {
    const csv = await request(app.getHttpServer())
      .get('/compliance/evidence/export?format=csv')
      .set(auth(adminToken))
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text.split('\n')[0]).toBe(
      'code,title,category,source,status,collectedAt,validUntil,hash',
    );
    expect(csv.text).toContain(evidenceCode);

    const excel = await request(app.getHttpServer())
      .get('/compliance/evidence/export?format=excel')
      .set(auth(adminToken))
      .expect(200);
    expect(excel.headers['content-type']).toContain('application/vnd.ms-excel');
    expect(excel.text).toContain('mso-application');

    const pdf = await request(app.getHttpServer())
      .get('/compliance/evidence/export?format=pdf')
      .set(auth(adminToken))
      .buffer(true)
      .parse((res: any, callback: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  });

  it('runs an access review, flags privileged access, and completes it', async () => {
    const review = await request(app.getHttpServer())
      .post('/compliance/access-reviews')
      .set(auth(adminToken))
      .send({ name: `Quarterly access review ${stamp}`, scope: 'ALL_USERS' })
      .expect(201);
    expect(review.body.status).toBe('IN_PROGRESS');
    expect(review.body.reviewedCount).toBeGreaterThanOrEqual(2);
    expect(review.body.flaggedCount).toBeGreaterThan(0);
    expect(review.body.reviewedCount).toBe(review.body.findings.length);

    const adminFinding = review.body.findings.find(
      (finding: { email: string }) => finding.email === 'admin@abctrading.vn',
    );
    expect(adminFinding).toBeDefined();
    expect(adminFinding.flagged).toBe(true);
    expect(adminFinding.flagReasons).toContain('PRIVILEGED_ROLE');
    expect(adminFinding.roles.length).toBeGreaterThan(0);

    const done = await request(app.getHttpServer())
      .post(`/compliance/access-reviews/${review.body.id}/complete`)
      .set(auth(adminToken))
      .send({})
      .expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.completedAt).toBeTruthy();
    expect(done.body.flaggedCount).toBeGreaterThan(0);

    const list = await request(app.getHttpServer())
      .get('/compliance/access-reviews')
      .set(auth(adminToken))
      .expect(200);
    expect(list.body[0].id).toBe(review.body.id);
  });

  it('builds the role → permission matrix with risky assignments', async () => {
    const res = await request(app.getHttpServer())
      .get('/compliance/permission-review')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.roles.length).toBeGreaterThan(0);
    expect(res.body.totals.roles).toBe(res.body.roles.length);
    expect(res.body.totals.assignments).toBeGreaterThan(0);

    const adminRole = res.body.roles.find(
      (role: { code: string }) => role.code === 'admin',
    );
    expect(adminRole).toBeDefined();
    expect(adminRole.permissions).toContain('admin.access');
    expect(adminRole.users).toBeGreaterThanOrEqual(1);

    const risky = res.body.riskyPermissions.find(
      (entry: { permission: string }) => entry.permission === 'admin.access',
    );
    expect(risky).toBeDefined();
    expect(risky.roles).toContain('admin');
  });

  it('creates, scores, filters and mitigates risks', async () => {
    const created = await request(app.getHttpServer())
      .post('/compliance/risks')
      .set(auth(adminToken))
      .send({
        title: `Outdated CI dependency ${stamp}`,
        category: 'SECURITY',
        severity: 'HIGH',
        likelihood: 4,
        impact: 5,
        description: 'Known CVE in build tooling',
        mitigation: 'Upgrade plan in progress',
      })
      .expect(201);
    riskId = created.body.id;
    expect(created.body.score).toBe(20);
    expect(created.body.status).toBe('OPEN');

    const filtered = await request(app.getHttpServer())
      .get('/compliance/risks?severity=HIGH&status=OPEN')
      .set(auth(adminToken))
      .expect(200);
    expect(filtered.body.map((row: { id: string }) => row.id)).toContain(riskId);

    const updated = await request(app.getHttpServer())
      .patch(`/compliance/risks/${riskId}`)
      .set(auth(adminToken))
      .send({ status: 'MITIGATED', likelihood: 2 })
      .expect(200);
    expect(updated.body.status).toBe('MITIGATED');
    expect(updated.body.score).toBe(10);

    const report = await request(app.getHttpServer())
      .get('/compliance/reports/risks')
      .set(auth(adminToken))
      .expect(200);
    expect(report.body.total).toBeGreaterThanOrEqual(1);
    expect(report.body.bySeverity.HIGH).toBeGreaterThanOrEqual(1);
    expect(report.body.byStatus.MITIGATED).toBeGreaterThanOrEqual(1);
    expect(report.body.averageScore).toBeGreaterThan(0);
  });

  it('reports retention posture', async () => {
    const res = await request(app.getHttpServer())
      .get('/compliance/reports/retention')
      .set(auth(adminToken))
      .expect(200);
    expect(['ok', 'attention']).toContain(res.body.status);
    expect(typeof res.body.counts.audit_total).toBe('number');
    expect(typeof res.body.counts.audit_older_180).toBe('number');
    expect(typeof res.body.counts.scim_older_90).toBe('number');
    expect(Array.isArray(res.body.policies)).toBe(true);
    expect(res.body.checkedAt).toEqual(expect.any(String));
  });


  it('reports security controls and exposes Prometheus metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/compliance/reports/security')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.checks).toHaveLength(4);
    expect(res.body.score % 25).toBe(0);
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
    expect(res.body.checks.map((check: { id: string }) => check.id)).toEqual(
      expect.arrayContaining([
        'SSO_CONFIGURED',
        'SCIM_CONFIGURED',
        'STEP_UP_USED',
        'ACCESS_MONITORING',
      ]),
    );
    expect(typeof res.body.counts.logins_30d).toBe('number');

    const metrics = await request(app.getHttpServer())
      .get('/compliance/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('compliance_evidence_collected_total');
    expect(metrics.text).toContain('compliance_exports_total');
    expect(metrics.text).toContain('compliance_risks_created_total');
  });

  it('generates snapshots, a dashboard and analytics', async () => {
    const snapshot = await request(app.getHttpServer())
      .post('/compliance/snapshots')
      .set(auth(adminToken))
      .send({})
      .expect(201);
    for (const key of [
      'evidenceScore',
      'accessScore',
      'riskScore',
      'retentionScore',
      'securityScore',
      'overallScore',
    ]) {
      expect(snapshot.body[key]).toBeGreaterThanOrEqual(0);
      expect(snapshot.body[key]).toBeLessThanOrEqual(100);
    }
    expect(snapshot.body.metrics).toBeDefined();

    const snapshots = await request(app.getHttpServer())
      .get('/compliance/snapshots?limit=5')
      .set(auth(adminToken))
      .expect(200);
    expect(snapshots.body[0].id).toBe(snapshot.body.id);

    const dashboard = await request(app.getHttpServer())
      .get('/compliance/dashboard')
      .set(auth(adminToken))
      .expect(200);
    expect(dashboard.body.latestSnapshot.id).toBe(snapshot.body.id);
    expect(dashboard.body.scores.overall).toBeGreaterThanOrEqual(0);
    expect(dashboard.body.evidence.total).toBeGreaterThanOrEqual(5);
    expect(dashboard.body.accessReview.status).toBe('COMPLETED');
    expect(dashboard.body.retention.status).toEqual(expect.any(String));
    expect(dashboard.body.security.checks).toHaveLength(4);

    const analytics = await request(app.getHttpServer())
      .get('/compliance/analytics')
      .set(auth(adminToken))
      .expect(200);
    expect(analytics.body.trend.length).toBeGreaterThanOrEqual(1);
    expect(analytics.body.trend[analytics.body.trend.length - 1].id).toBe(
      snapshot.body.id,
    );
    expect(analytics.body.evidenceByCategory.length).toBeGreaterThanOrEqual(1);
    expect(analytics.body.risksBySeverity.length).toBeGreaterThanOrEqual(1);
    expect(analytics.body.reviewsByStatus.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps compliance data tenant-isolated', async () => {
    const cafeEvidence = await request(app.getHttpServer())
      .get('/compliance/evidence')
      .set(auth(cafeToken))
      .expect(200);
    expect(
      cafeEvidence.body.some((row: { code: string }) => row.code === evidenceCode),
    ).toBe(false);
    expect(
      cafeEvidence.body.every((row: { tenantId: string }) => row.tenantId !== abcTenantId),
    ).toBe(true);

    const cafeRisks = await request(app.getHttpServer())
      .get('/compliance/risks')
      .set(auth(cafeToken))
      .expect(200);
    expect(cafeRisks.body.some((row: { id: string }) => row.id === riskId)).toBe(false);

    const cafeDashboard = await request(app.getHttpServer())
      .get('/compliance/dashboard')
      .set(auth(cafeToken))
      .expect(200);
    expect(cafeDashboard.body.evidence.total).toBe(0);
    expect(cafeDashboard.body.scores.evidence).toBe(0);
    expect(cafeDashboard.body.accessReview).toBeNull();
  });
});

