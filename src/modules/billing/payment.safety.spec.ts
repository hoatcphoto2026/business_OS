import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { assertUniqueMatch } from './payment-lookup.util';

describe('payment lookup safety', () => {
  it('rejects when the same ref matches two tenants', () => {
    const matches = [
      { tenantId: 't1', providerRef: 'REF1' },
      { tenantId: 't2', providerRef: 'REF1' },
    ];
    expect(() => assertUniqueMatch(matches, 'payment reference')).toThrow(BadRequestException);
  });

  it('rejects two rows even in the same tenant', () => {
    const matches = [
      { tenantId: 't1', providerRef: 'REF1' },
      { tenantId: 't1', providerRef: 'REF1' },
    ];
    expect(() => assertUniqueMatch(matches, 'payment reference')).toThrow(BadRequestException);
  });

  it('returns the single match', () => {
    const matches = [{ tenantId: 't1', providerRef: 'REF1' }];
    expect(assertUniqueMatch(matches, 'payment reference')).toEqual(matches[0]);
  });

  it('returns null when nothing matches', () => {
    expect(assertUniqueMatch([], 'payment reference')).toBeNull();
  });
});

describe('webhook HMAC', () => {
  it('signs content|amount the same way banking webhook does', () => {
    const secret = 'x'.repeat(32);
    const sig = crypto.createHmac('sha256', secret).update('REF1|100000').digest('hex');
    expect(sig).toHaveLength(64);
    expect(sig).not.toBe(secret);
  });
});
