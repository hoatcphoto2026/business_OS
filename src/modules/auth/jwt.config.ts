import { JwtModuleOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export const DEV_JWT_SECRET = 'dev-secret-change-me';
export type JwtAlgorithm = 'HS256' | 'RS256';

type EnvLike = Record<string, string | undefined>;

export interface ResolvedJwtConfig {
  algorithm: JwtAlgorithm;
  moduleOptions: JwtModuleOptions;
  verify: { key: string; algorithms: JwtAlgorithm[] };
}

function read(
  config: ConfigService,
  env: EnvLike,
  key: string,
): string | undefined {
  return env[key] ?? config.get<string>(key);
}

/** Accepts PEM text (with escaped newlines) or base64-encoded PEM. */
function normalizePem(value: string): string {
  if (value.includes('BEGIN')) return value.replace(/\\n/g, '\n').trim();
  return Buffer.from(value, 'base64').toString('utf8').trim();
}

/**
 * Single source of truth for JWT signing/verification.
 *
 * Security rules:
 * - Production defaults to RS256 when key pairs are configured.
 * - HS256 in production is BLOCKED unless JWT_ALLOW_HS256_IN_PRODUCTION=true
 *   (explicit, auditable escape hatch during key-rollout windows).
 * - The dev fallback secret is rejected in production.
 */
export function resolveJwtConfig(
  config: ConfigService,
  env: EnvLike = process.env,
): ResolvedJwtConfig {
  const isProd = env.NODE_ENV === 'production';
  const expiresIn = read(config, env, 'JWT_EXPIRES_IN') || '8h';
  const requested = (read(config, env, 'JWT_ALGORITHM') || '').toUpperCase();
  const privateKey = read(config, env, 'JWT_PRIVATE_KEY');
  const publicKey = read(config, env, 'JWT_PUBLIC_KEY');

  if (requested && requested !== 'HS256' && requested !== 'RS256') {
    throw new Error(
      `Unsupported JWT_ALGORITHM "${requested}" – use HS256 or RS256`,
    );
  }

  const hasRs256Keys = Boolean(privateKey && publicKey);
  const algorithm: JwtAlgorithm =
    requested === 'RS256' || (!requested && isProd && hasRs256Keys)
      ? 'RS256'
      : 'HS256';

  if (algorithm === 'RS256') {
    if (!hasRs256Keys) {
      throw new Error(
        'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required when JWT_ALGORITHM=RS256',
      );
    }
    const signingKey = normalizePem(privateKey as string);
    const verificationKey = normalizePem(publicKey as string);
    return {
      algorithm,
      moduleOptions: {
        privateKey: signingKey,
        publicKey: verificationKey,
        signOptions: { algorithm: 'RS256', expiresIn },
      },
      verify: { key: verificationKey, algorithms: ['RS256'] },
    };
  }

  const secret = read(config, env, 'JWT_SECRET');
  if (isProd) {
    if (!secret || secret === DEV_JWT_SECRET || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    if (env.JWT_ALLOW_HS256_IN_PRODUCTION !== 'true') {
      throw new Error(
        'HS256 is disabled in production – configure JWT_PRIVATE_KEY/JWT_PUBLIC_KEY (RS256) ' +
          'or set JWT_ALLOW_HS256_IN_PRODUCTION=true explicitly',
      );
    }
  }

  const resolvedSecret = secret || DEV_JWT_SECRET;
  return {
    algorithm,
    moduleOptions: {
      secret: resolvedSecret,
      signOptions: { algorithm: 'HS256', expiresIn },
    },
    verify: { key: resolvedSecret, algorithms: ['HS256'] },
  };
}
