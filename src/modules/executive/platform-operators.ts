/**
 * Platform-operator allowlist (EPIC D1).
 *
 * Executive metrics aggregate **all tenants**, so they are restricted to
 * operator accounts:
 *  - production: only emails listed in `PLATFORM_ADMIN_EMAILS`
 *  - dev/test : falls back to `admin@abctrading.vn` when the env var is unset
 *  - production with an empty list => feature disabled (fail-closed)
 */
const DEFAULT_DEV_OPERATOR = 'admin@abctrading.vn';

export function platformOperatorEmails(): string[] {
  const configured = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return process.env.NODE_ENV === 'production' ? [] : [DEFAULT_DEV_OPERATOR];
}

export function isPlatformOperator(email?: string | null): boolean {
  if (!email) return false;
  return platformOperatorEmails().includes(email.trim().toLowerCase());
}
