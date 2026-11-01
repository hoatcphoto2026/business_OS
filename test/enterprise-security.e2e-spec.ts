/**
 * C6 Enterprise Security Hardening.
 * Requires migration:run and seed. No global prefix, same as C5.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Enterprise Security (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let salesToken: string;
  let cafeToken: string;
  let managerToken: string;
  let abcTenantId: string;
  let failedEventId: string;
  let alertRuleId: string;
  let apiKeyId: string;
  let scimEndpointId: string;
  let webhookId: string;
  let emergencyId: string;

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

    const login = async (
      email: string,
      tenant: string,
      headers: Record<string, string> = {},
    ) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set(headers)
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      return res.body.accessToken as string;
    };

    adminToken = await login('admin@abctrading.vn', 'ABC', {
      'x-country-code': 'VN',
      'x-city': 'Ho Chi Minh',
    });
    salesToken = await login('hcm.user@abctrading.vn', 'ABC');
    cafeToken = await login('owner@cafemoc.vn', 'CAFE_MOC');
    managerToken = await login('manager@abctrading.vn', 'ABC');

    const rows = await dataSource.query(
      "SELECT id FROM tenants WHERE code = 'ABC' LIMIT 1",
    );
    abcTenantId = rows[0].id as string;

    // Dual-control needs a second admin in the same tenant. RBAC (not the JWT
    // role) is the source of truth, so promoting manager here is sufficient.
    await dataSource.query(
      `INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
       SELECT gen_random_uuid(), u.id, r.id, now(), now()
         FROM users u, roles r
        WHERE u.email = 'manager@abctrading.vn'
          AND r.tenant_id = $1 AND r.code = 'admin'
          AND NOT EXISTS (
            SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
          )`,
      [abcTenantId],
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  async function stepUp(action: string, token: string): Promise<string> {
    const initiate = await request(app.getHttpServer())
      .post('/admin/step-up/initiate')
      .set(auth(token))
      .send({ action, method: 'totp' })
      .expect(201);
    const verify = await request(app.getHttpServer())
      .post('/admin/step-up/verify')
      .set(auth(token))
      .send({ sessionId: initiate.body.sessionId, code: '123456' })
      .expect(201);
    return verify.body.stepUpToken as string;
  }

  it('rejects anonymous and users without admin.access', async () => {
    await request(app.getHttpServer()).get('/security/dashboard').expect(401);
    await request(app.getHttpServer())
      .get('/security/dashboard')
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/security/alert-rules')
      .set(auth(salesToken))
      .send({ name: 'nope', eventType: 'FAILED_LOGIN' })
      .expect(403);
  });

  it('seeds alert rules and supports rule CRUD', async () => {
    const list = await request(app.getHttpServer())
      .get('/security/alert-rules')
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(5);
    const failedRule = list.body.find(
      (rule: { name: string }) => rule.name === 'Repeated failed logins',
    );
    expect(failedRule).toBeDefined();
    expect(failedRule.eventType).toBe('FAILED_LOGIN');
    expect(failedRule.threshold).toBe(5);
    expect(failedRule.enabled).toBe(true);

    const created = await request(app.getHttpServer())
      .post('/security/alert-rules')
      .set(auth(adminToken))
      .send({
        name: `Geo strict ${stamp}`,
        eventType: 'GEO_ANOMALY',
        threshold: 2,
        windowMinutes: 30,
        severity: 'CRITICAL',
        channels: ['email', 'slack'],
      })
      .expect(201);
    alertRuleId = created.body.id;
    expect(created.body.threshold).toBe(2);
    expect(created.body.channels).toEqual(['email', 'slack']);

    const disabled = await request(app.getHttpServer())
      .patch(`/security/alert-rules/${alertRuleId}`)
      .set(auth(adminToken))
      .send({ enabled: false })
      .expect(200);
    expect(disabled.body.enabled).toBe(false);

    await request(app.getHttpServer())
      .patch(`/security/alert-rules/${alertRuleId}`)
      .set(auth(adminToken))
      .send({ enabled: true })
      .expect(200);
  });

  it('detects repeated failed logins and dedupes findings', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-country-code', 'VN')
        .send({
          email: 'admin@abctrading.vn',
          password: `wrong-${i}-${stamp}`,
          tenant: 'ABC',
        })
        .expect(401);
    }

    const detection = await request(app.getHttpServer())
      .post('/security/detect/failed-logins')
      .set(auth(adminToken))
      .send({ windowMinutes: 15, threshold: 3 })
      .expect(200);
    expect(detection.body.type).toBe('FAILED_LOGIN');
    expect(detection.body.detected).toBeGreaterThanOrEqual(1);
    expect(detection.body.eventIds.length).toBeGreaterThanOrEqual(1);

    const finding = detection.body.findings.find(
      (row: { email: string }) => row.email === 'admin@abctrading.vn',
    );
    expect(finding.failures).toBeGreaterThanOrEqual(3);
    failedEventId = detection.body.eventIds[0];

    const event = await request(app.getHttpServer())
      .get(`/security/events/${failedEventId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(event.body.eventType).toBe('FAILED_LOGIN');
    expect(event.body.status).toBe('OPEN');
    expect(event.body.riskScore).toBeGreaterThanOrEqual(30);
    expect(event.body.metadata.failures).toBeGreaterThanOrEqual(3);

    const again = await request(app.getHttpServer())
      .post('/security/detect/failed-logins')
      .set(auth(adminToken))
      .send({ windowMinutes: 15, threshold: 3 })
      .expect(200);
    expect(again.body.eventIds[0]).toBe(failedEventId);

    const filtered = await request(app.getHttpServer())
      .get('/security/events?eventType=FAILED_LOGIN')
      .set(auth(adminToken))
      .expect(200);
    expect(filtered.body.map((row: { id: string }) => row.id)).toContain(
      failedEventId,
    );
  });


  it('detects failed-then-success credential stuffing as suspicious activity', async () => {
    const success = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@abctrading.vn', password: PASSWORD, tenant: 'ABC' })
      .expect(200);
    expect(success.body.accessToken).toEqual(expect.any(String));

    const detection = await request(app.getHttpServer())
      .post('/security/detect/suspicious-activity')
      .set(auth(adminToken))
      .send({ windowMinutes: 30 })
      .expect(200);
    expect(detection.body.type).toBe('SUSPICIOUS_ACTIVITY');
    const stuffing = detection.body.findings.find(
      (row: { kind: string; email: string }) =>
        row.kind === 'FAILED_THEN_SUCCESS' && row.email === 'admin@abctrading.vn',
    );
    expect(stuffing).toBeDefined();
    expect(stuffing.failures).toBeGreaterThanOrEqual(3);
    expect(detection.body.eventIds.length).toBeGreaterThanOrEqual(1);

    const events = await request(app.getHttpServer())
      .get('/security/events?eventType=SUSPICIOUS_ACTIVITY')
      .set(auth(adminToken))
      .expect(200);
    expect(events.body.length).toBeGreaterThanOrEqual(1);
    expect(events.body[0].severity).toBe('HIGH');
  });

  it('detects geo anomalies against the learned country baseline', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-country-code', 'US')
      .set('x-city', 'New York')
      .send({ email: 'admin@abctrading.vn', password: PASSWORD, tenant: 'ABC' })
      .expect(200);

    const geo = await request(app.getHttpServer())
      .post('/security/detect/geo-anomalies')
      .set(auth(adminToken))
      .send({})
      .expect(200);
    expect(geo.body.type).toBe('GEO_ANOMALY');
    expect(geo.body.detected).toBeGreaterThanOrEqual(1);

    const events = await request(app.getHttpServer())
      .get('/security/events?eventType=GEO_ANOMALY')
      .set(auth(adminToken))
      .expect(200);
    expect(events.body.length).toBeGreaterThanOrEqual(1);
    expect(events.body[0].country).toBe('US');

    const locations = await request(app.getHttpServer())
      .get('/security/login-locations')
      .set(auth(adminToken))
      .expect(200);
    const countries = locations.body.map(
      (row: { country: string }) => row.country,
    );
    expect(countries).toEqual(expect.arrayContaining(['VN', 'US']));
  });

  it('acknowledges and resolves events, and exposes the security audit trail', async () => {
    const acknowledged = await request(app.getHttpServer())
      .post(`/security/events/${failedEventId}/acknowledge`)
      .set(auth(adminToken))
      .send({ notes: 'Investigating with infra team' })
      .expect(200);
    expect(acknowledged.body.status).toBe('ACKNOWLEDGED');
    expect(acknowledged.body.acknowledgedAt).toBeTruthy();

    const resolved = await request(app.getHttpServer())
      .post(`/security/events/${failedEventId}/resolve`)
      .set(auth(adminToken))
      .send({ notes: 'Password rotated, user notified' })
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');
    expect(resolved.body.resolvedAt).toBeTruthy();
    expect(resolved.body.resolutionNotes).toBe('Password rotated, user notified');

    const trail = await request(app.getHttpServer())
      .get('/security/audit-trail')
      .set(auth(adminToken))
      .expect(200);
    expect(Array.isArray(trail.body)).toBe(true);
    expect(trail.body.length).toBeGreaterThan(0);
    expect(
      trail.body.some(
        (row: { entityType: string; entityId: string }) =>
          row.entityType === 'security_event' && row.entityId === failedEventId,
      ),
    ).toBe(true);
  });

  it('fires alert rules when thresholds are reached', async () => {
    const rules = await request(app.getHttpServer())
      .get('/security/alert-rules')
      .set(auth(adminToken))
      .expect(200);
    const geoRule = rules.body.find(
      (rule: { eventType: string; threshold: number }) =>
        rule.eventType === 'GEO_ANOMALY' && rule.threshold === 1,
    );
    expect(geoRule).toBeDefined();
    expect(geoRule.triggerCount).toBeGreaterThanOrEqual(1);
    expect(geoRule.lastTriggeredAt).toBeTruthy();
  });


  it('rotates API keys, SCIM tokens and webhook secrets behind step-up', async () => {
    const apiKey = await request(app.getHttpServer())
      .post('/integration/api-keys')
      .set(auth(adminToken))
      .send({ name: `Rotation key ${stamp}` })
      .expect(201);
    apiKeyId = apiKey.body.id;
    expect(apiKey.body.plainKey.startsWith('bos_')).toBe(true);

    const scimEndpoint = await request(app.getHttpServer())
      .post('/scim/endpoints')
      .set(auth(adminToken))
      .send({
        name: `Rotation SCIM ${stamp}`,
        organizationCode: `ROT-${stamp}`,
      })
      .expect(201);
    scimEndpointId = scimEndpoint.body.id;
    expect(scimEndpoint.body.token).toEqual(expect.any(String));

    const inserted = await dataSource.query(
      `INSERT INTO webhooks (id, tenant_id, name, url, events, secret, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'https://hooks.example.com/security', '[]'::jsonb, 'initial-secret', 'active', now(), now())
       RETURNING id`,
      [abcTenantId, `Rotation hook ${stamp}`],
    );
    webhookId = inserted[0].id as string;

    // Sensitive mutation without step-up must be rejected (not 2xx).
    await request(app.getHttpServer())
      .post(`/security/rotations/api-keys/${apiKeyId}`)
      .set(auth(adminToken))
      .send({ reason: 'Quarterly rotation' })
      .expect(412);

    const keyStepUp = await stepUp('security.rotate-api-key', adminToken);
    const rotatedKey = await request(app.getHttpServer())
      .post(`/security/rotations/api-keys/${apiKeyId}`)
      .set(auth(adminToken))
      .set('X-Step-Up-Token', keyStepUp)
      .send({ reason: 'Quarterly rotation' })
      .expect(200);
    expect(rotatedKey.body.resourceType).toBe('API_KEY');
    expect(rotatedKey.body.secret.startsWith('bos_')).toBe(true);
    expect(rotatedKey.body.secret).not.toBe(apiKey.body.plainKey);
    expect(rotatedKey.body.prefix).toBe(rotatedKey.body.secret.slice(0, 12));

    const scimStepUp = await stepUp('security.rotate-scim-token', adminToken);
    const rotatedScim = await request(app.getHttpServer())
      .post(`/security/rotations/scim-endpoints/${scimEndpointId}`)
      .set(auth(adminToken))
      .set('X-Step-Up-Token', scimStepUp)
      .send({ reason: 'Vendor offboarding' })
      .expect(200);
    expect(rotatedScim.body.secret).toHaveLength(48);
    expect(rotatedScim.body.secret).not.toBe(scimEndpoint.body.token);

    const hookStepUp = await stepUp('security.rotate-webhook-secret', adminToken);
    const rotatedHook = await request(app.getHttpServer())
      .post(`/security/rotations/webhooks/${webhookId}`)
      .set(auth(adminToken))
      .set('X-Step-Up-Token', hookStepUp)
      .send({ reason: 'Secret exposure drill' })
      .expect(200);
    expect(rotatedHook.body.secret).toHaveLength(32);
    expect(rotatedHook.body.secret).not.toBe('initial-secret');

    const history = await request(app.getHttpServer())
      .get('/security/rotations')
      .set(auth(adminToken))
      .expect(200);
    const types = history.body.map(
      (row: { resourceType: string }) => row.resourceType,
    );
    expect(types).toEqual(
      expect.arrayContaining(['API_KEY', 'SCIM_TOKEN', 'WEBHOOK_SECRET']),
    );

    const metrics = await request(app.getHttpServer())
      .get('/security/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.text).toContain('security_secret_rotations_total');
  });


  it('enforces dual-control emergency access with step-up and expiry', async () => {
    const requested = await request(app.getHttpServer())
      .post('/security/emergency-access')
      .set(auth(adminToken))
      .send({
        reason: 'Production database incident – need elevated access',
        durationMinutes: 15,
      })
      .expect(201);
    emergencyId = requested.body.id;
    expect(requested.body.status).toBe('PENDING');
    expect(requested.body.expiresAt).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/security/emergency-access/${emergencyId}/approve`)
      .set(auth(adminToken))
      .send({})
      .expect(412);

    const adminStepUp = await stepUp('security.emergency-access', adminToken);
    await request(app.getHttpServer())
      .post(`/security/emergency-access/${emergencyId}/approve`)
      .set(auth(adminToken))
      .set('X-Step-Up-Token', adminStepUp)
      .send({})
      .expect(403);

    const managerStepUp = await stepUp(
      'security.emergency-access',
      managerToken,
    );
    const approved = await request(app.getHttpServer())
      .post(`/security/emergency-access/${emergencyId}/approve`)
      .set(auth(managerToken))
      .set('X-Step-Up-Token', managerStepUp)
      .send({ notes: 'Approved for the incident window' })
      .expect(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.approverId).toEqual(expect.any(String));
    expect(approved.body.approverId).not.toBe(approved.body.requesterId);
    expect(approved.body.approvedAt).toBeTruthy();

    const list = await request(app.getHttpServer())
      .get('/security/emergency-access')
      .set(auth(adminToken))
      .expect(200);
    const entry = list.body.find(
      (row: { id: string }) => row.id === emergencyId,
    );
    expect(entry.status).toBe('APPROVED');

    const revokeStepUp = await stepUp(
      'security.emergency-access',
      managerToken,
    );
    const revoked = await request(app.getHttpServer())
      .post(`/security/emergency-access/${emergencyId}/revoke`)
      .set(auth(managerToken))
      .set('X-Step-Up-Token', revokeStepUp)
      .send({ notes: 'Incident resolved' })
      .expect(200);
    expect(revoked.body.status).toBe('REVOKED');
    expect(revoked.body.revokedAt).toBeTruthy();

    const dashboard = await request(app.getHttpServer())
      .get('/security/dashboard')
      .set(auth(adminToken))
      .expect(200);
    expect(dashboard.body.emergencyAccessActive).toBe(false);
    expect(dashboard.body.events.total).toBeGreaterThan(0);
    expect(Array.isArray(dashboard.body.events.byType)).toBe(true);
  });

  it('exposes threat monitoring, login signals and Prometheus metrics', async () => {
    const threats = await request(app.getHttpServer())
      .get('/security/threats')
      .set(auth(adminToken))
      .expect(200);
    expect(threats.body.events.total).toBeGreaterThanOrEqual(1);
    expect(threats.body.logins.failures).toBeGreaterThanOrEqual(3);
    expect(threats.body.alertRules.enabled).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(threats.body.topIps)).toBe(true);
    expect(threats.body.criticalOpen.length).toBeGreaterThanOrEqual(1);

    const attempts = await request(app.getHttpServer())
      .get('/security/login-attempts?success=false')
      .set(auth(adminToken))
      .expect(200);
    expect(
      attempts.body.some(
        (row: { email: string; reason: string }) =>
          row.email === 'admin@abctrading.vn' && row.reason === 'INVALID_PASSWORD',
      ),
    ).toBe(true);

    const locations = await request(app.getHttpServer())
      .get('/security/login-locations')
      .set(auth(adminToken))
      .expect(200);
    expect(
      locations.body.some((row: { country: string }) => row.country === 'VN'),
    ).toBe(true);

    const metrics = await request(app.getHttpServer())
      .get('/security/metrics')
      .set(auth(adminToken))
      .expect(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('security_login_attempts_total');
    expect(metrics.text).toContain('security_events_total');
    expect(metrics.text).toContain('security_detections_total');
  });

  it('keeps security data tenant-isolated', async () => {
    const cafeEvents = await request(app.getHttpServer())
      .get('/security/events')
      .set(auth(cafeToken))
      .expect(200);
    expect(
      cafeEvents.body.some((row: { id: string }) => row.id === failedEventId),
    ).toBe(false);

    await request(app.getHttpServer())
      .get(`/security/events/${failedEventId}`)
      .set(auth(cafeToken))
      .expect(404);

    const cafeRules = await request(app.getHttpServer())
      .get('/security/alert-rules')
      .set(auth(cafeToken))
      .expect(200);
    expect(
      cafeRules.body.some((row: { id: string }) => row.id === alertRuleId),
    ).toBe(false);

    const cafeRotations = await request(app.getHttpServer())
      .get('/security/rotations')
      .set(auth(cafeToken))
      .expect(200);
    expect(cafeRotations.body).toHaveLength(0);

    const cafeAttempts = await request(app.getHttpServer())
      .get('/security/login-attempts')
      .set(auth(cafeToken))
      .expect(200);
    expect(
      cafeAttempts.body.some(
        (row: { email: string }) => row.email === 'admin@abctrading.vn',
      ),
    ).toBe(false);
  });
});

