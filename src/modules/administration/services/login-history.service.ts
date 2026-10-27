import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginHistory } from '../entities/login-history.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

@Injectable()
export class LoginHistoryService {
  constructor(
    @InjectRepository(LoginHistory) private readonly histories: Repository<LoginHistory>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list(limit = 50) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    return this.histories.find({
      where: { tenantId },
      order: { loginAt: 'DESC' },
      take: limit,
    });
  }

  async recordLogin(tenantId: string, userId: string, ipAddress?: string | null, userAgent?: string | null) {
    return this.histories.save(
      this.histories.create({
        tenantId,
        userId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        loginAt: new Date(),
      }),
    );
  }

  async recordLogout(tenantId: string, userId: string) {
    const latest = await this.histories.findOne({
      where: { tenantId, userId, logoutAt: null as any },
      order: { loginAt: 'DESC' },
    });
    if (latest) {
      latest.logoutAt = new Date();
      await this.histories.save(latest);
    }
  }
}
