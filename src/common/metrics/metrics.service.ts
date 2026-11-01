import { Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client';

type Labels = Record<string, string | number>;

/**
 * Shared Prometheus registry for the whole application.
 *
 * Before this existed every module kept its own `Map<string, number>`, so
 * metrics reset on restart, could not be labelled, and each `/metrics`
 * endpoint only exposed its own module. All modules now increment the same
 * registry, which also exposes the Node.js process metrics.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry = new Registry();
  private readonly counters = new Map<string, Counter<string>>();
  private readonly gauges = new Map<string, Gauge<string>>();

  onModuleInit(): void {
    this.registry.setDefaultLabels({
      service: process.env.OTEL_SERVICE_NAME || 'business-os-backend',
    });
    collectDefaultMetrics({ register: this.registry });
    this.logger.log('Prometheus registry initialised (default + process metrics)');
  }

  inc(name: string, labels: Labels = {}, value = 1): void {
    const counter = this.getCounter(name, Object.keys(labels));
    counter.inc(labels, value);
  }

  set(name: string, value: number, labels: Labels = {}): void {
    const gauge = this.getGauge(name, Object.keys(labels));
    gauge.set(labels, value);
  }

  async text(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  private getCounter(name: string, labelNames: string[]): Counter<string> {
    const existing = this.counters.get(name);
    if (existing) return existing;
    const counter = new Counter({
      name,
      help: `${name} counter`,
      labelNames,
      registers: [this.registry],
    });
    this.counters.set(name, counter);
    return counter;
  }

  private getGauge(name: string, labelNames: string[]): Gauge<string> {
    const existing = this.gauges.get(name);
    if (existing) return existing;
    const gauge = new Gauge({
      name,
      help: `${name} gauge`,
      labelNames,
      registers: [this.registry],
    });
    this.gauges.set(name, gauge);
    return gauge;
  }
}
