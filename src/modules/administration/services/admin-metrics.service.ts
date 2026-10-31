import { Injectable, Logger } from '@nestjs/common';

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
  private readonly counters = new Map<string, number>();

  record(method: string, status: number, traceId: string, ms: number, path?: string) {
    const now = Date.now();
    this.samples.push({ at: now, status, method, traceId, ms, path });
    const cutoff = now - 60_000;
    while (this.samples.length && this.samples[0].at < cutoff) this.samples.shift();

    this.inc(`http_requests_total{status="${status}",method="${method}"}`);

    const denied = this.samples.filter((s) => s.status === 403).length;
    const total = this.samples.length;
    const ratio = total > 0 ? denied / total : 0;
    const mutations = this.samples.filter((s) => s.method !== 'GET').length;

    if (ratio > 0.20 || denied >= 20 || mutations >= 40) {
      this.alerts += 1;
      this.logger.warn(
        `ALERT admin_403_spike trace=${traceId} denied=${denied} ratio=${ratio.toFixed(2)} mutations=${mutations} window=60s`,
      );
    }
  }

  incApiKeyCreated(tenantId: string) {
    this.inc(`apikey_created_total{tenant="${tenantId}"}`);
  }

  incWebhookError(webhookId: string, reason: string) {
    this.inc(`webhook_delivery_errors_total{webhook="${webhookId}",reason="${reason}"}`);
  }

  private inc(key: string) {
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
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

  prometheus(): string {
    const lines: string[] = [
      '# HELP admin_http_requests_total Admin HTTP requests',
      '# TYPE admin_http_requests_total counter',
    ];
    for (const [key, value] of this.counters) {
      lines.push(`${key} ${value}`);
    }
    lines.push('# HELP admin_403_alerts_total Number of 403 spike alerts fired');
    lines.push('# TYPE admin_403_alerts_total counter');
    lines.push(`admin_403_alerts_total ${this.alerts}`);
    lines.push('# HELP admin_denied_ratio Current 60s 403 ratio');
    lines.push('# TYPE admin_denied_ratio gauge');
    const snap = this.snapshot();
    lines.push(`admin_denied_ratio ${snap.deniedRatio}`);
    return lines.join('\n') + '\n';
  }
}
