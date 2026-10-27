/**
 * OpenTelemetry tracing bootstrap.
 * Import before other application modules so instrumentation can patch them.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'business-os-backend',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
    }),
  ],
});

sdk.start();

process.once('SIGTERM', () => {
  void sdk.shutdown().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error('Failed to shut down OpenTelemetry SDK', error);
      process.exit(1);
    },
  );
});
