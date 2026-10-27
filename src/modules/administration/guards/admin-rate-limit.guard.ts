import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';

/**
 * Limits admin mutations per user. Reads are not counted.
 * Window is 60 seconds. Limit comes from ADMIN_MUTATE_LIMIT (default 30).
 */
@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;

    const key = req.user?.userId || req.ip || 'anonymous';
    const limit = Number(process.env.ADMIN_MUTATE_LIMIT || 30);
    const now = Date.now();
    const recent = (this.hits.get(key) || []).filter((ts) => now - ts < 60_000);

    if (recent.length >= limit) {
      throw new HttpException('Too many administration changes. Try again in a minute.', 429);
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
