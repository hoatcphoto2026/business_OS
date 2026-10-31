import { AdminMetricsService } from '../services/admin-metrics.service';

describe('AdminMetricsService (unit)', () => {
  let service: AdminMetricsService;

  beforeEach(() => {
    service = new AdminMetricsService();
  });

  it('records requests and computes 403 ratio', () => {
    service.record('GET', 200, 't1', 10);
    service.record('GET', 403, 't2', 12);
    service.record('POST', 403, 't3', 15);
    const snap = service.snapshot();
    expect(snap.requests).toBe(3);
    expect(snap.denied).toBe(2);
    expect(snap.deniedRatio).toBeCloseTo(0.6667, 3);
  });

  it('exposes prometheus text with counters', () => {
    service.record('GET', 200, 't', 5);
    service.incApiKeyCreated('tenant-abc');
    service.incWebhookError('wh-1', 'timeout');
    const text = service.prometheus();
    expect(text).toContain('admin_http_requests_total');
    expect(text).toContain('apikey_created_total');
    expect(text).toContain('webhook_delivery_errors_total');
    expect(text).toContain('admin_denied_ratio');
  });

  it('increments alert counter on high 403 ratio', () => {
    for (let i = 0; i < 10; i++) service.record('GET', 403, `t${i}`, 10);
    const snap = service.snapshot();
    expect(snap.alerts).toBeGreaterThan(0);
  });
});
