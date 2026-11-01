import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isPlatformOperator } from './platform-operators';

/**
 * Restricts executive metrics to platform operators (see platform-operators.ts).
 * Runs after JwtAuthGuard so `req.user.email` is available.
 */
@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const email = req.user?.email as string | undefined;
    if (!isPlatformOperator(email)) {
      throw new ForbiddenException(
        'Executive metrics are restricted to platform operators (PLATFORM_ADMIN_EMAILS)',
      );
    }
    return true;
  }
}
