import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

/**
 * P2 – Lightweight OpenTelemetry-style tracing interceptor.
 * Emits structured span logs (compatible with OTEL collectors via log shipping).
 * Full OTEL SDK can be wired later by replacing the logger with a Tracer.
 */
@Injectable()
export class AdminTracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminTrace');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const spanId = Math.random().toString(36).slice(2, 10);
    const traceId = (req.headers['x-request-id'] as string) || spanId;
    const start = Date.now();
    const route = req.route?.path || req.url;
    const method = req.method;
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user?.id || req.user?.sub;

    this.logger.log(
      JSON.stringify({
        event: 'span.start',
        traceId,
        spanId,
        name: `HTTP ${method} ${route}`,
        attributes: { tenantId, userId, method, route },
      }),
    );

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.log(
          JSON.stringify({
            event: 'span.end',
            traceId,
            spanId,
            durationMs: duration,
            status: 'OK',
          }),
        );
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        this.logger.error(
          JSON.stringify({
            event: 'span.error',
            traceId,
            spanId,
            durationMs: duration,
            status: 'ERROR',
            error: err?.message,
          }),
        );
        return throwError(() => err);
      }),
    );
  }
}
