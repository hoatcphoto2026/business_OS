import { diffSnapshots, toAuditSnapshot, extractRequestMeta } from './audit.serializer';

describe('audit serializer', () => {
  it('stores only the fields that changed', () => {
    const diff = diffSnapshots(
      toAuditSnapshot({ id: '1', name: 'Cafe Mộc', updatedAt: '2026-01-01' }),
      toAuditSnapshot({ id: '1', name: 'Cafe Mộc Premium', updatedAt: '2026-01-02' }),
    );

    expect(diff.oldData).toEqual({ name: 'Cafe Mộc' });
    expect(diff.newData).toEqual({ name: 'Cafe Mộc Premium' });
  });

  it('strips secrets and bookkeeping columns', () => {
    const snapshot = toAuditSnapshot({
      id: '1',
      name: 'A',
      passwordHash: 'secret',
      accessToken: 'jwt',
      updatedBy: 'user',
      createdAt: '2026-01-01',
    });

    expect(snapshot).toEqual({ id: '1', name: 'A' });
  });

  it('reads the first forwarded ip', () => {
    const meta = extractRequestMeta({
      headers: {
        'x-forwarded-for': '203.0.113.8, 10.0.0.1',
        'user-agent': 'BusinessOS/1.0',
      },
    });
    expect(meta.ipAddress).toBe('203.0.113.8');
    expect(meta.userAgent).toBe('BusinessOS/1.0');
  });
});
