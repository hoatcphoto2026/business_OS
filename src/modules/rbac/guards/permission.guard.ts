import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { AuthorizationService } from '../authorization.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantUser, MembershipStatus } from '../../tenant/entities/tenant-user.entity';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    @InjectRepository(TenantUser)
    private readonly memberships: Repository<TenantUser>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Owner/admin membership has full access within the tenant
    if (user.tenantId) {
      const m = await this.memberships.findOne({
        where: { userId: user.userId, tenantId: user.tenantId, status: MembershipStatus.ACTIVE },
      });
      if (m && (m.role === 'owner' || m.role === 'admin')) {
        return true;
      }
    }

    for (const perm of requiredPermissions) {
      const has = await this.authorizationService.hasPermission(
        user.userId,
        perm,
        user.tenantId,
      );
      if (!has) {
        throw new ForbiddenException(`Missing permission: ${perm}`);
      }
    }

    return true;
  }
}
