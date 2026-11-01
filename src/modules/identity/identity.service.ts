import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, createHmac, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify as cryptoVerify } from 'crypto';
import * as bcrypt from 'bcrypt';
import { IdentityProvider } from './entities/identity-provider.entity';
import { IdentityMapping } from './entities/identity-mapping.entity';
import { SSOSession } from './entities/sso-session.entity';
import { IdentityProviderType, SsoSessionStatus } from './enums/identity.enum';
import { CreateIdentityProviderDto, IdentityCallbackDto } from './dto/identity.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { MembershipStatus, TenantUser } from '../tenant/entities/tenant-user.entity';
import { Role } from '../rbac/entities/role.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const SESSION_TTL_MS = 15 * 60 * 1000;
const JWKS_TTL_MS = 10 * 60 * 1000;
const RSA_ALGS: Record<string, string> = {
  RS256: 'RSA-SHA256',
  RS384: 'RSA-SHA384',
  RS512: 'RSA-SHA512',
};

interface JwkKey {
  kty?: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}

interface IdTokenHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface IdTokenClaims {
  sub?: string;
  email?: string;
  name?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  /** issuer -> JWKS keys (cached to avoid fetching on every login). */
  private readonly jwksCache = new Map<string, { keys: JwkKey[]; fetchedAt: number }>();

  constructor(
    @InjectRepository(IdentityProvider)
    private readonly providers: Repository<IdentityProvider>,
    @InjectRepository(IdentityMapping)
    private readonly mappings: Repository<IdentityMapping>,
    @InjectRepository(SSOSession)
    private readonly sessions: Repository<SSOSession>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(TenantUser)
    private readonly memberships: Repository<TenantUser>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    private readonly tenantContext: TenantContextService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  async createProvider(dto: CreateIdentityProviderDto) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    if (dto.type === IdentityProviderType.ENTRA && !dto.entraTenantId) {
      throw new BadRequestException('Entra ID requires entraTenantId');
    }
    const saved = await this.providers.save(
      this.providers.create({
        tenantId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        enabled: dto.enabled ?? true,
        issuer: this.resolveIssuer(dto.type, dto.issuer, dto.entraTenantId),
        clientId: dto.clientId,
        clientSecret: dto.clientSecret,
        entraTenantId: dto.entraTenantId ?? null,
        redirectUri: dto.redirectUri,
        defaultRole: dto.defaultRole ?? 'member',
        rbacRoleCode: dto.rbacRoleCode ?? null,
        samlEntityId: dto.samlEntityId ?? null,
        samlAcsUrl: dto.samlAcsUrl ?? null,
        createdBy: this.safeUserId(),
      }),
    );
    await this.auditSafe('identity_provider', saved.id, AuditAction.CREATE, { code: saved.code, type: saved.type });
    this.metricsService.inc('identity_providers_created_total');
    return this.publicProvider(saved);
  }

  async listProviders() {
    const rows = await this.providers.find({
      where: { tenantId: this.tenantContext.getCurrentTenantId() },
      order: { code: 'ASC' },
    });
    return rows.map((row) => this.publicProvider(row));
  }

  async setEnabled(id: string, enabled: boolean) {
    const row = await this.providers.findOne({
      where: { id, tenantId: this.tenantContext.getCurrentTenantId() },
    });
    if (!row) throw new NotFoundException('Identity provider not found');
    row.enabled = enabled;
    row.updatedBy = this.safeUserId();
    const saved = await this.providers.save(row);
    await this.auditSafe('identity_provider', saved.id, AuditAction.UPDATE, { enabled });
    return this.publicProvider(saved);
  }

  async discovery(code: string, tenantCode: string) {
    const provider = await this.findProvider(code, tenantCode);
    this.tagSpan(provider.id, provider.type);
    if (provider.type === IdentityProviderType.SAML) {
      return {
        protocol: 'saml',
        provider: provider.code,
        entityId: provider.samlEntityId,
        acsUrl: provider.samlAcsUrl,
        ssoUrl: provider.issuer,
      };
    }
    const endpoints = this.endpoints(provider);
    return {
      protocol: 'oidc',
      provider: provider.code,
      type: provider.type,
      issuer: provider.issuer,
      authorization_endpoint: endpoints.authorization,
      token_endpoint: endpoints.token,
      jwks_uri: endpoints.jwks,
      response_types_supported: ['code', 'id_token'],
      code_challenge_methods_supported: ['S256'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['HS256', 'RS256'],
    };
  }

  async startLogin(code: string, tenantCode: string, traceId?: string) {
    const provider = await this.requireEnabled(code, tenantCode);
    const state = randomUUID();
    const nonce = randomUUID();
    // PKCE (RFC 7636): the verifier never leaves the backend.
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const session = await this.sessions.save(
      this.sessions.create({
        tenantId: provider.tenantId,
        providerId: provider.id,
        state,
        nonce,
        codeVerifier,
        codeChallenge,
        codeChallengeMethod: 'S256',
        status: SsoSessionStatus.PENDING,
        traceId: traceId ?? null,
      }),
    );
    this.metricsService.inc('identity_logins_started_total');
    if (provider.type === IdentityProviderType.SAML) {
      return {
        protocol: 'saml',
        sessionId: session.id,
        state,
        entityId: provider.samlEntityId,
        acsUrl: provider.samlAcsUrl,
        ssoUrl: provider.issuer,
      };
    }
    const endpoints = this.endpoints(provider);
    const url = new URL(endpoints.authorization);
    url.searchParams.set('client_id', provider.clientId);
    url.searchParams.set('redirect_uri', provider.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { protocol: 'oidc', sessionId: session.id, state, authorizationUrl: url.toString() };
  }

  async callback(dto: IdentityCallbackDto, meta?: { ipAddress?: string | null; userAgent?: string | null }) {
    const session = await this.sessions.findOne({ where: { state: dto.state } });
    if (!session || session.status !== SsoSessionStatus.PENDING) {
      throw new UnauthorizedException('SSO state is invalid');
    }
    const created = session.createdAt instanceof Date ? session.createdAt.getTime() : new Date(session.createdAt).getTime();
    if (Date.now() - created > SESSION_TTL_MS) {
      throw new UnauthorizedException('SSO state has expired');
    }
    const provider = await this.providers.findOne({ where: { id: session.providerId, tenantId: session.tenantId } });
    if (!provider || !provider.enabled) throw new ForbiddenException('Identity provider is disabled');
    if (provider.type === IdentityProviderType.SAML) {
      throw new BadRequestException('SAML assertion consumer is not enabled');
    }
    if (!dto.idToken && !dto.code) {
      throw new BadRequestException('code or idToken is required to complete the OIDC login');
    }
    // Prefer the authorization code: the exchange happens server-side, so the
    // client secret never leaves the backend.
    const idToken = dto.code
      ? await this.exchangeCode(provider, dto.code, session.codeVerifier)
      : (dto.idToken as string);
    const claims = await this.verifyIdToken(idToken, provider, session.nonce);
    const tenant = await this.tenants.findOne({ where: { id: provider.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const provisioned = await this.provision(provider, claims);
    session.status = SsoSessionStatus.ACTIVE;
    session.userId = provisioned.user.id;
    session.externalSubject = claims.sub;
    session.authenticatedAt = new Date();
    await this.sessions.save(session);
    this.metricsService.inc('identity_logins_total');
    this.tagSpan(provider.id, provider.type);

    const issued = await this.auth.issueTenantSession(provisioned.user, provisioned.membership, {
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });
    return {
      ...issued,
      sso: {
        sessionId: session.id,
        provider: provider.code,
        createdUser: provisioned.createdUser,
        createdMembership: provisioned.createdMembership,
        assignedRole: provisioned.assignedRole,
      },
    };
  }

  async listSessions() {
    return this.sessions.find({
      where: { tenantId: this.tenantContext.getCurrentTenantId() },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async metrics(): Promise<string> {
    return this.metricsService.text();
  }

  private async provision(
    provider: IdentityProvider,
    claims: { sub: string; email: string; name?: string },
  ) {
    let createdUser = false;
    let createdMembership = false;
    let assignedRole = false;
    let mapping = await this.mappings.findOne({
      where: { providerId: provider.id, externalSubject: claims.sub },
    });
    let user = mapping
      ? await this.users.findOne({ where: { id: mapping.userId } })
      : await this.users.findOne({ where: { email: claims.email } });
    if (!user) {
      user = await this.users.save(
        this.users.create({
          email: claims.email,
          fullName: claims.name || claims.email,
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
          isActive: true,
        }),
      );
      createdUser = true;
      this.metricsService.inc('identity_users_provisioned_total');
    }
    let membership = await this.memberships.findOne({
      where: { tenantId: provider.tenantId, userId: user.id },
      relations: ['tenant'],
    });
    if (!membership) {
      membership = await this.memberships.save(
        this.memberships.create({
          tenantId: provider.tenantId,
          userId: user.id,
          role: provider.defaultRole,
          status: MembershipStatus.ACTIVE,
        }),
      );
      const tenant = await this.tenants.findOne({ where: { id: provider.tenantId } });
      if (!tenant) {
        throw new UnauthorizedException('Tenant not found');
      }
      membership.tenant = tenant;
      createdMembership = true;
    }
    if (provider.rbacRoleCode) {
      const role = await this.roles.findOne({
        where: { tenantId: provider.tenantId, code: provider.rbacRoleCode },
      });
      if (role) {
        const existing = await this.userRoles.findOne({ where: { userId: user.id, roleId: role.id } });
        if (!existing) {
          await this.userRoles.save(this.userRoles.create({ userId: user.id, roleId: role.id }));
          assignedRole = true;
        }
      }
    }
    if (!mapping) {
      mapping = await this.mappings.save(
        this.mappings.create({
          tenantId: provider.tenantId,
          providerId: provider.id,
          userId: user.id,
          externalSubject: claims.sub,
          email: claims.email,
          createdBy: user.id,
        }),
      );
      await this.auditSafe('identity_mapping', mapping.id, AuditAction.CREATE, {
        providerId: provider.id,
        userId: user.id,
        createdUser,
        createdMembership,
        assignedRole,
      });
    }
    return { user, membership, createdUser, createdMembership, assignedRole };
  }

  /**
   * Verify an OIDC id_token.
   *
   * - RS256/384/512 (Google, Entra, any compliant OIDC IdP): verified against
   *   the provider JWKS (cached, key selected by `kid`, refreshed on rotation).
   * - HS256: kept for internal/mock providers where the client secret is shared
   *   with the backend only. Real IdPs never sign id_tokens with it.
   */
  private async verifyIdToken(
    token: string,
    provider: IdentityProvider,
    nonce: string,
  ): Promise<{ sub: string; email: string; name?: string }> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid id_token');
    const [headerPart, bodyPart, signature] = parts;
    const header = JSON.parse(
      Buffer.from(headerPart, 'base64url').toString('utf8'),
    ) as IdTokenHeader;
    const alg = header.alg ?? '';
    const signingInput = `${headerPart}.${bodyPart}`;
    const signatureBuffer = Buffer.from(signature, 'base64url');

    if (alg === 'HS256') {
      const expected = createHmac('sha256', provider.clientSecret)
        .update(signingInput)
        .digest();
      if (
        signatureBuffer.length !== expected.length ||
        !timingSafeEqual(signatureBuffer, expected)
      ) {
        throw new UnauthorizedException('Invalid id_token signature');
      }
    } else if (RSA_ALGS[alg]) {
      const jwk = await this.findSigningKey(provider, header.kid);
      let verified = false;
      try {
        const publicKey = createPublicKey({ key: jwk as never, format: 'jwk' });
        verified = cryptoVerify(
          RSA_ALGS[alg],
          Buffer.from(signingInput),
          publicKey,
          signatureBuffer,
        );
      } catch {
        verified = false;
      }
      if (!verified) throw new UnauthorizedException('Invalid id_token signature');
    } else {
      throw new UnauthorizedException('Unsupported id_token algorithm');
    }

    const claims = JSON.parse(
      Buffer.from(bodyPart, 'base64url').toString('utf8'),
    ) as IdTokenClaims;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!claims.sub || !claims.email) {
      throw new UnauthorizedException('id_token is missing sub or email');
    }
    if (claims.iss !== provider.issuer) {
      throw new UnauthorizedException('id_token issuer does not match the provider');
    }
    if (!audience.includes(provider.clientId)) {
      throw new UnauthorizedException('id_token audience does not match the provider');
    }
    if (claims.nonce !== nonce) {
      throw new UnauthorizedException('id_token nonce does not match the login session');
    }
    if (!claims.exp || claims.exp * 1000 < Date.now()) {
      throw new UnauthorizedException('id_token has expired');
    }
    return { sub: claims.sub, email: claims.email, name: claims.name };
  }

  /** Exchange the authorization code at the provider token endpoint (server-side). */
  private async exchangeCode(
    provider: IdentityProvider,
    code: string,
    codeVerifier: string | null = null,
  ): Promise<string> {
    const endpoints = this.endpoints(provider);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: provider.redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });

    let response: Response;
    try {
      response = await fetch(endpoints.token, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: body.toString(),
      });
    } catch (err) {
      this.logger.warn(`Token exchange request failed: ${(err as Error).message}`);
      throw new UnauthorizedException(
        'Unable to reach the identity provider token endpoint',
      );
    }
    if (!response.ok) {
      throw new UnauthorizedException('Authorization code exchange failed');
    }
    const payload = (await response.json()) as { id_token?: string };
    if (!payload.id_token) {
      throw new UnauthorizedException('Token endpoint did not return an id_token');
    }
    return payload.id_token;
  }

  private async findSigningKey(
    provider: IdentityProvider,
    kid?: string,
  ): Promise<Record<string, unknown>> {
    const jwksUri = this.endpoints(provider).jwks;
    let keys = await this.fetchJwks(jwksUri);
    let match = this.pickKey(keys, kid);
    if (!match) {
      // Key rotation: refresh the cache once before giving up.
      this.jwksCache.delete(jwksUri);
      keys = await this.fetchJwks(jwksUri);
      match = this.pickKey(keys, kid);
    }
    if (!match) {
      throw new UnauthorizedException('No matching JWKS key for the id_token');
    }
    return match;
  }

  private pickKey(keys: JwkKey[], kid?: string): Record<string, unknown> | null {
    const rsaKeys = keys.filter((key) => key.kty === 'RSA' && key.n && key.e);
    const selected = kid
      ? rsaKeys.find((key) => key.kid === kid)
      : rsaKeys[0];
    return (selected as Record<string, unknown> | undefined) ?? null;
  }

  private async fetchJwks(jwksUri: string): Promise<JwkKey[]> {
    const cached = this.jwksCache.get(jwksUri);
    if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
      return cached.keys;
    }

    let response: Response;
    try {
      response = await fetch(jwksUri, { headers: { accept: 'application/json' } });
    } catch (err) {
      this.logger.warn(`JWKS fetch failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Unable to fetch the identity provider JWKS');
    }
    if (!response.ok) {
      throw new UnauthorizedException('Unable to fetch the identity provider JWKS');
    }
    const payload = (await response.json()) as { keys?: JwkKey[] };
    const keys = payload.keys ?? [];
    this.jwksCache.set(jwksUri, { keys, fetchedAt: Date.now() });
    return keys;
  }

  private async findProvider(code: string, tenantCode: string) {
    const tenant = await this.tenants.findOne({ where: [{ code: tenantCode }, { slug: tenantCode }] });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const provider = await this.providers.findOne({ where: { tenantId: tenant.id, code } });
    if (!provider) throw new NotFoundException('Identity provider not found');
    return provider;
  }

  private async requireEnabled(code: string, tenantCode: string) {
    const provider = await this.findProvider(code, tenantCode);
    if (!provider.enabled) throw new ForbiddenException('Identity provider is disabled');
    return provider;
  }

  private resolveIssuer(type: IdentityProviderType, issuer?: string, entraTenantId?: string) {
    if (type === IdentityProviderType.GOOGLE) return issuer || GOOGLE_ISSUER;
    if (type === IdentityProviderType.ENTRA) return issuer || `https://login.microsoftonline.com/${entraTenantId}/v2.0`;
    if (!issuer) throw new BadRequestException('issuer is required');
    return issuer;
  }

  private endpoints(provider: IdentityProvider) {
    if (provider.type === IdentityProviderType.GOOGLE) {
      return {
        authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
        jwks: 'https://www.googleapis.com/oauth2/v3/certs',
      };
    }
    if (provider.type === IdentityProviderType.ENTRA) {
      const tenant = provider.entraTenantId;
      return {
        authorization: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        jwks: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      };
    }
    const issuer = provider.issuer.replace(/\/$/, '');
    return {
      authorization: `${issuer}/authorize`,
      token: `${issuer}/token`,
      jwks: `${issuer}/jwks`,
    };
  }

  private publicProvider(row: IdentityProvider) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      name: row.name,
      type: row.type,
      enabled: row.enabled,
      issuer: row.issuer,
      clientId: row.clientId,
      entraTenantId: row.entraTenantId,
      redirectUri: row.redirectUri,
      defaultRole: row.defaultRole,
      rbacRoleCode: row.rbacRoleCode,
      samlEntityId: row.samlEntityId,
      samlAcsUrl: row.samlAcsUrl,
    };
  }

  private safeUserId() {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  private async auditSafe(entity: string, id: string, action: AuditAction, data: Record<string, unknown>) {
    try {
      await this.audit.logAction(entity, id, action, { newData: data });
    } catch (err) {
      this.logger.warn(`Identity audit skipped: ${(err as Error).message}`);
    }
  }

  private tagSpan(providerId: string, type: string) {
    try {
      const api = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
      api.trace.getActiveSpan()?.setAttribute('identity.provider_id', providerId);
      api.trace.getActiveSpan()?.setAttribute('identity.provider_type', type);
    } catch {
      this.logger.debug('OpenTelemetry API is not active for this identity event');
    }
  }
}
