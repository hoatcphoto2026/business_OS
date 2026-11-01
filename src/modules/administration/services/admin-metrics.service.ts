import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../../common/metrics/metrics.service';

interface Sample {
  at: number;
  status: number;
  method: string;
  traceId: string;
  ms: number;
  path?: string;
}

@Injectable()
export class AdminMetricsService {
  private readonly logger = new Logger('AdminMetrics');
  private readonly samples: Sample[] = [];
  private alerts = 0;

  constructor(private readonly metrics: MetricsService) {}

  record(method: string, status: number, traceId: string, ms: number, path?: string) {
    const now = Date.now();
    this.samples.push({ at: now, status, method, traceId, ms, path });
    const cutoff = now - 60_000;
    while (this.samples.length && this.samples[0].at < cutoff) this.samples.shift();

    this.metrics.inc('http_requests_total', { status: String(status), method });

    const denied = this.samples.filter((s) => s.status === 403).length;
    const total = this.samples.length;
    const ratio = total > 0 ? denied / total : 0;
    const mutations = this.samples.filter((s) => s.method !== 'GET').length;

    if (ratio > 0.20 || denied >= 20 || mutations >= 40) {
      this.alerts += 1;
      this.metrics.inc('admin_403_alerts_total');
      this.logger.warn(
        `ALERT admin_403_spike trace=${traceId} denied=${denied} ratio=${ratio.toFixed(2)} mutations=${mutations} window=60s`,
      );
    }
  }

  incApiKeyCreated(tenantId: string) {
    this.metrics.inc('apikey_created_total', { tenant: tenantId });
  }

  incWebhookError(webhookId: string, reason: string) {
    this.metrics.inc('webhook_delivery_errors_total', { webhook: webhookId, reason });
  }



  snapshot() {
    const requests = this.samples.length;
    const denied = this.samples.filter((s) => s.status === 403).length;
    const errors = this.samples.filter((s) => s.status >= 500).length;
    const mutations = this.samples.filter((s) => s.method !== 'GET').length;
    const last = this.samples[this.samples.length - 1];
    const ratio = requests > 0 ? denied / requests : 0;
    return {
      windowSeconds: 60,
      requests,
      denied,
      errors,
      mutations,
      deniedRatio: Number(ratio.toFixed(4)),
      alerts: this.alerts,
      lastTraceId: last?.traceId ?? null,
      lastLatencyMs: last?.ms ?? null,
    };
  }

  async prometheus(): Promise<string> {
    this.metrics.set('admin_denied_ratio', this.snapshot().deniedRatio);
    return this.metrics.text();
  }
}
