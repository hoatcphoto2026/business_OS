/**
 * C3 Enterprise Identity.
 * Requires migration:run and seed. No global prefix, same as the other e2e suites.
 */
import { createHmac, generateKeyPairSync, sign as cryptoSign } from 'crypto';
import type { KeyObject } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

function signIdToken(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** RS256 id_token – same shape Google/Entra emit (signed with a private key). */
function signRsaIdToken(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
  kid: string,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = cryptoSign(
    'RSA-SHA256',
    Buffer.from(`${header}.${body}`),
    privateKey,
  ).toString('base64url');
  return `${header}.${body}.${signature}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Enterprise Identity (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let salesToken: string;
  const PASSWORD = 'Password123!';
  const stamp = Date.now();
  const secret = 'identity-test-secret-32chars';

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
      return res.body.accessToken as string;
    };
    adminToken = await login('admin@abctrading.vn', 'ABC');
    salesToken = await login('hcm.user@abctrading.vn', 'ABC');
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createProvider(body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post('/identity/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(201);
    return res.body as { id: string; code: string; issuer: string };
  }

  it('rejects anonymous and non-admin provider management', async () => {
    await request(app.getHttpServer()).post('/identity/providers').send({}).expect(401);
    await request(app.getHttpServer())
      .post('/identity/providers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        code: `denied-${stamp}`,
        name: 'Denied',
        type: 'OIDC',
        clientId: 'client',
        clientSecret: secret,
        redirectUri: 'https://app.example/callback',
        issuer: 'https://idp.example',
      })
      .expect(403);
  });

  it('discovers Google, Entra, OIDC, and SAML-ready providers', async () => {
    const google = await createProvider({
      code: `google-${stamp}`,
      name: 'Google',
      type: 'GOOGLE',
      clientId: 'google-client',
      clientSecret: secret,
      redirectUri: 'https://app.example/google',
    });
    const entra = await createProvider({
      code: `entra-${stamp}`,
      name: 'Entra',
      type: 'ENTRA',
      clientId: 'entra-client',
      clientSecret: secret,
      redirectUri: 'https://app.example/entra',
      entraTenantId: 'contoso-tenant',
    });
    const oidc = await createProvider({
      code: `oidc-${stamp}`,
      name: 'OIDC',
      type: 'OIDC',
      clientId: 'oidc-client',
      clientSecret: secret,
      redirectUri: 'https://app.example/oidc',
      issuer: 'https://idp.example/realms/abc',
    });
    await createProvider({
      code: `saml-${stamp}`,
      name: 'SAML',
      type: 'SAML',
      clientId: 'saml-client',
      clientSecret: secret,
      redirectUri: 'https://app.example/saml',
      issuer: 'https://idp.example/saml/sso',
      samlEntityId: 'business-os',
      samlAcsUrl: 'https://app.example/saml/acs',
    });

    const googleDoc = await request(app.getHttpServer())
      .get(`/identity/providers/${google.code}/discovery`)
      .query({ tenant: 'ABC' })
      .expect(200);
    expect(googleDoc.body.authorization_endpoint).toContain('accounts.google.com');
    expect(google.issuer).toBe('https://accounts.google.com');

    const entraDoc = await request(app.getHttpServer())
      .get(`/identity/providers/${entra.code}/discovery`)
      .query({ tenant: 'ABC' })
      .expect(200);
    expect(entraDoc.body.authorization_endpoint).toContain('login.microsoftonline.com/contoso-tenant');

    const oidcDoc = await request(app.getHttpServer())
      .get(`/identity/providers/${oidc.code}/discovery`)
      .query({ tenant: 'ABC' })
      .expect(200);
    expect(oidcDoc.body.issuer).toBe('https://idp.example/realms/abc');
    expect(oidcDoc.body.jwks_uri).toBe('https://idp.example/realms/abc/jwks');

    const samlDoc = await request(app.getHttpServer())
      .get(`/identity/providers/saml-${stamp}/discovery`)
      .query({ tenant: 'ABC' })
      .expect(200);
    expect(samlDoc.body.protocol).toBe('saml');
    expect(samlDoc.body.entityId).toBe('business-os');
  });

  it('logs in with a verified id_token, provisions the user once, and tracks the session', async () => {
    const provider = await createProvider({
      code: `login-${stamp}`,
      name: 'Google login',
      type: 'GOOGLE',
      clientId: `client-${stamp}`,
      clientSecret: secret,
      redirectUri: 'https://app.example/callback',
      defaultRole: 'member',
      rbacRoleCode: 'sales',
    });

    await request(app.getHttpServer())
      .post(`/identity/providers/${provider.id}/disable`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .get(`/identity/login/${provider.code}`)
      .query({ tenant: 'ABC' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/identity/providers/${provider.id}/enable`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const started = await request(app.getHttpServer())
      .get(`/identity/login/${provider.code}`)
      .query({ tenant: 'ABC' })
      .set('x-request-id', 'trace-c3-sso')
      .expect(200);
    expect(started.body.authorizationUrl).toContain('accounts.google.com');
    expect(started.body.authorizationUrl).toContain(`client-${stamp}`);

    const email = `sso-${stamp}@example.com`;
    const subject = `google-sub-${stamp}`;
    const nonce = new URL(started.body.authorizationUrl).searchParams.get('nonce');
    const token = signIdToken(
      {
        sub: subject,
        email,
        name: 'SSO User',
        iss: 'https://accounts.google.com',
        aud: `client-${stamp}`,
        nonce,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      secret,
    );

    const done = await request(app.getHttpServer())
      .post('/identity/callback')
      .send({ state: started.body.state, idToken: token })
      .expect(201);
    expect(done.body.accessToken).toEqual(expect.any(String));
    expect(done.body.user.email).toBe(email);
    expect(done.body.sso.createdUser).toBe(true);
    expect(done.body.sso.createdMembership).toBe(true);
    expect(done.body.sso.assignedRole).toBe(true);

    const again = await request(app.getHttpServer())
      .get(`/identity/login/${provider.code}`)
      .query({ tenant: 'ABC' })
      .expect(200);
    const nonce2 = new URL(again.body.authorizationUrl).searchParams.get('nonce');
    const second = await request(app.getHttpServer())
      .post('/identity/callback')
      .send({
        state: again.body.state,
        idToken: signIdToken(
          {
            sub: subject,
            email,
            iss: 'https://accounts.google.com',
            aud: `client-${stamp}`,
            nonce: nonce2,
            exp: Math.floor(Date.now() / 1000) + 300,
          },
          secret,
        ),
      })
      .expect(201);
    expect(second.body.user.id).toBe(done.body.user.id);
    expect(second.body.sso.createdUser).toBe(false);

    const bad = await request(app.getHttpServer())
      .get(`/identity/login/${provider.code}`)
      .query({ tenant: 'ABC' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/identity/callback')
      .send({
        state: bad.body.state,
        idToken: signIdToken(
          {
            sub: subject,
            email,
            iss: 'https://accounts.google.com',
            aud: `client-${stamp}`,
            nonce: 'wrong-nonce',
            exp: Math.floor(Date.now() / 1000) + 300,
          },
          secret,
        ),
      })
      .expect(401);

    const sessions = await request(app.getHttpServer())
      .get('/identity/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(sessions.body.some((row: { id: string; traceId: string | null }) => row.id === started.body.sessionId)).toBe(true);

    const metrics = await request(app.getHttpServer())
      .get('/identity/metrics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(metrics.text).toContain('identity_logins_total');
    expect(metrics.text).toContain('identity_users_provisioned_total');

    const dataSource = app.get(DataSource);
    const roles = await dataSource.query(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [done.body.user.id],
    );
    expect(roles.map((row: { code: string }) => row.code)).toContain('sales');
  });

  it('verifies RS256 id_tokens against the provider JWKS (Google/Entra style)', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = `kid-${stamp}`;
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    const issuer = `https://idp-${stamp}.example.com`;
    const clientId = `client-rs256-${stamp}`;

    const provider = await createProvider({
      code: `rs256-${stamp}`,
      name: 'RS256 OIDC',
      type: 'OIDC',
      issuer,
      clientId,
      clientSecret: secret,
      redirectUri: 'https://app.example/callback',
    });

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((async (input: any) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url === `${issuer}/jwks`) {
          return jsonResponse({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] });
        }
        return new Response('not found', { status: 404 });
      }) as any);

    try {
      const started = await request(app.getHttpServer())
        .get(`/identity/login/${provider.code}`)
        .query({ tenant: 'ABC' })
        .expect(200);
      const nonce = new URL(started.body.authorizationUrl).searchParams.get('nonce') as string;
      const email = `rs256-${stamp}@example.com`;

      const done = await request(app.getHttpServer())
        .post('/identity/callback')
        .send({
          state: started.body.state,
          idToken: signRsaIdToken(
            {
              sub: `rs256-sub-${stamp}`,
              email,
              iss: issuer,
              aud: clientId,
              nonce,
              exp: Math.floor(Date.now() / 1000) + 300,
            },
            privateKey,
            kid,
          ),
        })
        .expect(201);
      expect(done.body.accessToken).toEqual(expect.any(String));
      expect(done.body.user.email).toBe(email);
      expect(done.body.sso.createdUser).toBe(true);

      // Tampered signature must be rejected even with valid claims.
      const badStart = await request(app.getHttpServer())
        .get(`/identity/login/${provider.code}`)
        .query({ tenant: 'ABC' })
        .expect(200);
      const badNonce = new URL(badStart.body.authorizationUrl).searchParams.get('nonce') as string;
      const goodToken = signRsaIdToken(
        {
          sub: `rs256-sub-${stamp}`,
          email,
          iss: issuer,
          aud: clientId,
          nonce: badNonce,
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        privateKey,
        kid,
      );
      const tampered = `${goodToken.slice(0, -4)}AAAA`;
      await request(app.getHttpServer())
        .post('/identity/callback')
        .send({ state: badStart.body.state, idToken: tampered })
        .expect(401);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('exchanges an authorization code server-side and verifies the returned id_token', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = `kid-code-${stamp}`;
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    const issuer = `https://code-idp-${stamp}.example.com`;
    const clientId = `client-code-${stamp}`;
    const email = `code-${stamp}@example.com`;

    const provider = await createProvider({
      code: `code-${stamp}`,
      name: 'Code exchange OIDC',
      type: 'OIDC',
      issuer,
      clientId,
      clientSecret: secret,
      redirectUri: 'https://app.example/callback',
    });

    let issuedNonce = '';
    const tokenRequests: string[] = [];

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url === `${issuer}/jwks`) {
          return jsonResponse({
            keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }],
          });
        }
        if (url === `${issuer}/token` && init?.method === 'POST') {
          tokenRequests.push(String(init.body ?? ''));
          return jsonResponse({
            token_type: 'Bearer',
            id_token: signRsaIdToken(
              {
                sub: `code-sub-${stamp}`,
                email,
                iss: issuer,
                aud: clientId,
                nonce: issuedNonce,
                exp: Math.floor(Date.now() / 1000) + 300,
              },
              privateKey,
              kid,
            ),
          });
        }
        return new Response('not found', { status: 404 });
      }) as any);

    try {
      const started = await request(app.getHttpServer())
        .get(`/identity/login/${provider.code}`)
        .query({ tenant: 'ABC' })
        .expect(200);
      issuedNonce = new URL(started.body.authorizationUrl).searchParams.get('nonce') as string;
      // PKCE: challenge is sent to the IdP, the verifier stays in the backend.
      expect(started.body.authorizationUrl).toContain('code_challenge=');
      expect(started.body.authorizationUrl).toContain('code_challenge_method=S256');

      const done = await request(app.getHttpServer())
        .post('/identity/callback')
        .send({ state: started.body.state, code: 'auth-code-123' })
        .expect(201);

      expect(done.body.accessToken).toEqual(expect.any(String));
      expect(done.body.user.email).toBe(email);
      expect(tokenRequests).toHaveLength(1);
      expect(tokenRequests[0]).toContain('grant_type=authorization_code');
      expect(tokenRequests[0]).toContain('code=auth-code-123');
      expect(tokenRequests[0]).toContain(`client_id=${clientId}`);
      expect(tokenRequests[0]).toContain('code_verifier=');

      // The same state cannot be replayed once the session is completed.
      await request(app.getHttpServer())
        .post('/identity/callback')
        .send({ state: started.body.state, code: 'auth-code-123' })
        .expect(401);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('cleans up abandoned SSO sessions on demand', async () => {
    const provider = await createProvider({
      code: `cleanup-${stamp}`,
      name: 'Cleanup provider',
      type: 'OIDC',
      issuer: `https://cleanup-${stamp}.example.com`,
      clientId: `cleanup-client-${stamp}`,
      clientSecret: secret,
      redirectUri: 'https://app.example/callback',
    });

    const dataSource = app.get(DataSource);
    const tenantRows = await dataSource.query(
      `SELECT id FROM tenants WHERE code = 'ABC'`,
    );
    const tenantId = tenantRows[0].id as string;
    const oldState = `old-state-${stamp}`;
    const freshState = `fresh-state-${stamp}`;

    await dataSource.query(
      `INSERT INTO sso_sessions (tenant_id, provider_id, state, nonce, status, created_at)
       VALUES ($1, $2, $3, 'nonce', 'PENDING', now() - interval '2 hours')`,
      [tenantId, provider.id, oldState],
    );
    await dataSource.query(
      `INSERT INTO sso_sessions (tenant_id, provider_id, state, nonce, status, created_at)
       VALUES ($1, $2, $3, 'nonce', 'PENDING', now())`,
      [tenantId, provider.id, freshState],
    );

    const cleaned = await request(app.getHttpServer())
      .post('/identity/sessions/cleanup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(cleaned.body.pendingDeleted).toBeGreaterThanOrEqual(1);

    const remaining = await dataSource.query(
      `SELECT state FROM sso_sessions WHERE state IN ($1, $2)`,
      [oldState, freshState],
    );
    const states = remaining.map((row: { state: string }) => row.state);
    expect(states).not.toContain(oldState);
    expect(states).toContain(freshState);

    await dataSource.query(`DELETE FROM sso_sessions WHERE state = $1`, [freshState]);
  });
});
