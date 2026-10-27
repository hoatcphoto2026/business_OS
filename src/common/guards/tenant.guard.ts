import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from '../../modules/tenant/entities/tenant.entity';
import {
  TenantUser,
  MembershipStatus,
} from '../../modules/tenant/entities/tenant-user.entity';

/**
 * TenantGuard – validation only.
 * Context is established by TenantContextInterceptor (runs after this guard).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantUser)
    private readonly tenantUserRepo: Repository<TenantUser>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { userId: string; tenantId: string; role: string }
      | undefined;

    if (!user?.tenantId || !user?.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: user.tenantId },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    if (
      tenant.status !== TenantStatus.ACTIVE &&
      tenant.status !== TenantStatus.TRIAL
    ) {
      throw new ForbiddenException('Tenant is not active');
    }

    const membership = await this.tenantUserRepo.findOne({
      where: {
        tenantId: user.tenantId,
        userId: user.userId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (!membership) {
      throw new ForbiddenException('User does not belong to this tenant');
    }

    return true;
  }
}
