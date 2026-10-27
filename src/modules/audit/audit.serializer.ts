/**
 * Snapshots stored in old_data / new_data.
 * Secrets and noisy bookkeeping columns are stripped so a later
 * Business Copilot can read the diff without a second redaction pass.
 */

const IGNORE = new Set([
  'updatedAt',
  'createdAt',
  'updatedBy',
  'password',
  'passwordHash',
  'accessToken',
  'plainKey',
  'secret',
  'webhookSecret',
  'keyHash',
]);

export function toAuditSnapshot(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object') return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (IGNORE.has(key)) continue;
    out[key] = entry === undefined ? null : entry;
  }
  return out;
}

export function diffSnapshots(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
): { oldData: Record<string, unknown>; newData: Record<string, unknown> } {
  const oldData: Record<string, unknown> = {};
  const newData: Record<string, unknown> = {};
  const keys = new Set<string>([
    ...Object.keys(previous ?? {}),
    ...Object.keys(next ?? {}),
  ]);

  for (const key of keys) {
    const before = previous?.[key] ?? null;
    const after = next?.[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      oldData[key] = before;
      newData[key] = after;
    }
  }

  return { oldData, newData };
}

export function readUuid(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function startOfRange(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

export function endOfRange(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}

export interface RequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export function extractRequestMeta(req: RequestLike): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const forwarded = req.headers?.['x-forwarded-for'];
  let ip: string | null = null;
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    ip = forwarded.split(',')[0]?.trim() ?? null;
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    ip = String(forwarded[0]).split(',')[0]?.trim() ?? null;
  } else if (req.ip) {
    ip = req.ip;
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  const ua = req.headers?.['user-agent'];
  const userAgent = typeof ua === 'string' ? ua : null;
  return {
    ipAddress: clip(ip, 64),
    userAgent: clip(userAgent, 512),
  };
}
