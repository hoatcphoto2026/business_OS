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

    // PAST_DUE stays reachable on purpose: BillingService maps a cancelled
    // subscription to TenantStatus.PAST_DUE so the owner can log in and
    // reactivate (see mapStatusToTenant). Feature/subscription guards still
    // block the actual business operations.
    const allowedStatuses: TenantStatus[] = [
      TenantStatus.ACTIVE,
      TenantStatus.TRIAL,
      TenantStatus.PAST_DUE,
    ];

    if (!allowedStatuses.includes(tenant.status)) {
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
