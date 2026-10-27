import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request & { traceId?: string }, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const traceId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    req.traceId = traceId;
    res.setHeader('x-request-id', traceId);
    next();
  }
}
