import { describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { resolveJwtConfig, DEV_JWT_SECRET } from './jwt.config';

const configFrom = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

const RSA_PRIVATE = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----';
const RSA_PUBLIC = '-----BEGIN PUBLIC KEY-----\\nxyz\\n-----END PUBLIC KEY-----';

describe('resolveJwtConfig', () => {
  it('defaults to HS256 with the dev secret outside production', () => {
    const resolved = resolveJwtConfig(configFrom({}), { NODE_ENV: 'test' });
    expect(resolved.algorithm).toBe('HS256');
    expect(resolved.moduleOptions.secret).toBe(DEV_JWT_SECRET);
    expect(resolved.verify.algorithms).toEqual(['HS256']);
  });

  it('blocks HS256 in production without an explicit opt-in', () => {
    expect(() =>
      resolveJwtConfig(
        configFrom({ JWT_SECRET: 'x'.repeat(40) }),
        { NODE_ENV: 'production' },
      ),
    ).toThrow(/HS256 is disabled in production/);
  });

  it('rejects weak or default secrets in production even with opt-in', () => {
    expect(() =>
      resolveJwtConfig(configFrom({ JWT_SECRET: 'short' }), {
        NODE_ENV: 'production',
        JWT_ALLOW_HS256_IN_PRODUCTION: 'true',
      }),
    ).toThrow(/at least 32 characters/);

    expect(() =>
      resolveJwtConfig(configFrom({ JWT_SECRET: DEV_JWT_SECRET }), {
        NODE_ENV: 'production',
        JWT_ALLOW_HS256_IN_PRODUCTION: 'true',
      }),
    ).toThrow(/at least 32 characters/);
  });

  it('allows HS256 in production only with opt-in and a strong secret', () => {
    const resolved = resolveJwtConfig(
      configFrom({ JWT_SECRET: 'y'.repeat(48) }),
      { NODE_ENV: 'production', JWT_ALLOW_HS256_IN_PRODUCTION: 'true' },
    );
    expect(resolved.algorithm).toBe('HS256');
    expect(resolved.moduleOptions.secret).toBe('y'.repeat(48));
  });

  it('prefers RS256 when key pairs are configured in production', () => {
    const resolved = resolveJwtConfig(
      configFrom({ JWT_PRIVATE_KEY: RSA_PRIVATE, JWT_PUBLIC_KEY: RSA_PUBLIC }),
      { NODE_ENV: 'production' },
    );
    expect(resolved.algorithm).toBe('RS256');
    expect(resolved.verify.algorithms).toEqual(['RS256']);
    expect(String(resolved.verify.key)).toContain('BEGIN PUBLIC KEY');
    expect(String(resolved.verify.key)).toContain('\n');
  });

  it('fails when RS256 is requested without key pairs', () => {
    expect(() =>
      resolveJwtConfig(configFrom({ JWT_ALGORITHM: 'RS256' }), {
        NODE_ENV: 'production',
      }),
    ).toThrow(/JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required/);
  });

  it('rejects unsupported algorithms', () => {
    expect(() =>
      resolveJwtConfig(configFrom({ JWT_ALGORITHM: 'none' }), {
        NODE_ENV: 'test',
      }),
    ).toThrow(/Unsupported JWT_ALGORITHM/);
  });
});
