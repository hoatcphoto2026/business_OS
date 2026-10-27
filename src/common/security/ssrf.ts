import { BadRequestException } from '@nestjs/common';
import { promises as dns } from 'dns';
import { isIP } from 'net';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
]);

function isPrivateAddress(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === '::1' || value === '0.0.0.0' || value === '::') return true;
  if (value.startsWith('127.') || value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.')) {
    return true;
  }
  if (value.startsWith('172.')) {
    const second = Number(value.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80')) return true;
  return false;
}

/**
 * Reject webhook URLs that can reach the local network or cloud metadata.
 * https only. Literal private IPs and DNS answers are both checked.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid webhook URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL must use https');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new BadRequestException('Webhook URL host is not allowed');
  }

  const addresses = isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true })).map((row) => row.address);

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new BadRequestException('Webhook URL resolves to a private or local address');
  }
}
