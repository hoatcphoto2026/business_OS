import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AdminMetricsService } from '../services/admin-metrics.service';

@Injectable()
export class AdminObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly metrics: AdminMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const started = Date.now();
    const traceId = req.traceId || req.headers['x-request-id'] || 'missing-trace';

    const done = (status: number) => {
      this.metrics.record(req.method, status, String(traceId), Date.now() - started);
    };

    return next.handle().pipe(
      tap(() => done(res.statusCode || 200)),
      catchError((err) => {
        done(typeof err?.getStatus === 'function' ? err.getStatus() : err?.status || 500);
        return throwError(() => err);
      }),
    );
  }
}
