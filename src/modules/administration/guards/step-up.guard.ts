import {
  Injectable,
  CanActivate,
  ExecutionContext,
  PreconditionFailedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STEP_UP_ACTION } from '../decorators/require-step-up.decorator';
import { StepUpService } from '../services/step-up.service';

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stepUp: StepUpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only skip when explicitly requested (do NOT auto-skip in NODE_ENV=test
    // because billing-security and administration e2e tests assert 412)
    if (process.env.SKIP_STEP_UP === 'true') {
      return true;
    }

    const action = this.reflector.get<string>(STEP_UP_ACTION, context.getHandler());
    if (!action) return true;

    const req = context.switchToHttp().getRequest();
    const token = req.headers['x-step-up-token'] as string | undefined;
    // JwtStrategy exposes the user id as `userId`; `id` / `sub` are legacy fallbacks.
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    const tenantId = req.tenantId || req.user?.tenantId;

    if (!token || !userId || !tenantId) {
      throw new PreconditionFailedException({
        message: 'Step-up authentication required',
        action,
        challenge: 'totp',
      });
    }

    const valid = await this.stepUp.consume(token, tenantId, userId, action);
    if (!valid) {
      throw new ForbiddenException('Invalid or expired step-up token');
    }

    return true;
  }
}
