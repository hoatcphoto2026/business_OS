import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import {
  TenantUser,
  MembershipStatus,
} from '../tenant/entities/tenant-user.entity';
import { Tenant, TenantStatus } from '../tenant/entities/tenant.entity';
import { UserCompany } from '../organization/entities/user-company.entity';
import { UserBranch } from '../organization/entities/user-branch.entity';
import { UserDepartment } from '../organization/entities/user-department.entity';
import { LoginHistory } from '../administration/entities/login-history.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuditService } from '../audit/audit.service';
import { AuditActorOverride } from '../audit/audit.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TenantUser)
    private readonly tenantUserRepo: Repository<TenantUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(UserCompany)
    private readonly userCompanyRepo: Repository<UserCompany>,
    @InjectRepository(UserBranch)
    private readonly userBranchRepo: Repository<UserBranch>,
    @InjectRepository(UserDepartment)
    private readonly userDepartmentRepo: Repository<UserDepartment>,
    @InjectRepository(LoginHistory)
    private readonly loginHistories: Repository<LoginHistory>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async validateAndLogin(
    email: string,
    password: string,
    tenantCodeOrSlug?: string,
    meta?: Pick<AuditActorOverride, 'ipAddress' | 'userAgent'>,
  ) {
    const user = await this.userRepo.findOne({
      where: { email, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const memberships = await this.tenantUserRepo.find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      relations: ['tenant'],
    });

    const usable = memberships.filter(
      (m) =>
        m.tenant &&
        (m.tenant.status === TenantStatus.ACTIVE ||
          m.tenant.status === TenantStatus.TRIAL),
    );

    if (usable.length === 0) {
      throw new ForbiddenException('No active tenant membership');
    }

    if (tenantCodeOrSlug) {
      const match = usable.find(
        (m) =>
          m.tenant.code === tenantCodeOrSlug ||
          m.tenant.slug === tenantCodeOrSlug,
      );
      if (!match) {
        throw new ForbiddenException(
          `No active membership for tenant "${tenantCodeOrSlug}"`,
        );
      }
      return this.issueToken(user, match, meta);
    }

    if (usable.length === 1) {
      return this.issueToken(user, usable[0], meta);
    }

    return {
      requiresTenantSelection: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      tenants: usable.map((m) => ({
        tenantId: m.tenantId,
        code: m.tenant.code,
        slug: m.tenant.slug,
        name: m.tenant.name,
        role: m.role,
      })),
    };
  }

  async switchTenant(
    userId: string,
    tenantId: string,
    meta?: Pick<AuditActorOverride, 'ipAddress' | 'userAgent'>,
  ) {
    const membership = await this.tenantUserRepo.findOne({
      where: {
        userId,
        tenantId,
        status: MembershipStatus.ACTIVE,
      },
      relations: ['tenant', 'user'],
    });

    if (!membership) {
      throw new ForbiddenException('No active membership for this tenant');
    }

    if (
      membership.tenant.status !== TenantStatus.ACTIVE &&
      membership.tenant.status !== TenantStatus.TRIAL
    ) {
      throw new ForbiddenException('Tenant is not active');
    }

    return this.issueToken(membership.user, membership, meta);
  }

  async logout(
    user: {
      userId: string;
      tenantId: string;
      companyId?: string | null;
      branchId?: string | null;
    },
    meta?: Pick<AuditActorOverride, 'ipAddress' | 'userAgent'>,
  ) {
    await this.auditService.logLogout({
      userId: user.userId,
      tenantId: user.tenantId,
      companyId: user.companyId ?? null,
      branchId: user.branchId ?? null,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });

    // Record logout in login history
    const latest = await this.loginHistories.findOne({
      where: { tenantId: user.tenantId, userId: user.userId, logoutAt: null as any },
      order: { loginAt: 'DESC' },
    });
    if (latest) {
      latest.logoutAt = new Date();
      await this.loginHistories.save(latest);
    }

    return { success: true };
  }

  /**
   * Resolve the user's default organization context.
   * - companyId: first assigned company (or null)
   * - branchId: first assigned branch (null = company-level access)
   * - departmentId: first assigned department (or null)
   */
  private async resolveOrgContext(userId: string) {
    const companies = await this.userCompanyRepo.find({
      where: { userId },
      take: 1,
    });
    const branches = await this.userBranchRepo.find({
      where: { userId },
      take: 1,
    });
    const departments = await this.userDepartmentRepo.find({
      where: { userId },
      take: 1,
    });

    return {
      companyId: companies[0]?.companyId ?? null,
      branchId: branches[0]?.branchId ?? null,
      departmentId: departments[0]?.departmentId ?? null,
    };
  }

  private async issueToken(
    user: User,
    membership: TenantUser,
    meta?: Pick<AuditActorOverride, 'ipAddress' | 'userAgent'>,
  ) {
    const org = await this.resolveOrgContext(user.id);

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: membership.tenantId,
      role: membership.role,
      email: user.email,
      tokenVersion: user.tokenVersion ?? 0,
      companyId: org.companyId,
      branchId: org.branchId,
      departmentId: org.departmentId,
    };

    const result = {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: membership.role,
        tenantId: membership.tenantId,
        companyId: org.companyId,
        branchId: org.branchId,
        departmentId: org.departmentId,
      },
      tenant: {
        id: membership.tenantId,
        code: membership.tenant?.code,
        slug: membership.tenant?.slug,
        name: membership.tenant?.name,
      },
    };

    await this.auditService.logLogin({
      userId: user.id,
      tenantId: membership.tenantId,
      companyId: org.companyId,
      branchId: org.branchId,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });

    // Record login history
    await this.loginHistories.save(
      this.loginHistories.create({
        tenantId: membership.tenantId,
        userId: user.id,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
        loginAt: new Date(),
      }),
    );

    return result;
  }
}