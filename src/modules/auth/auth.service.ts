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
import { LoginAttemptService } from '../security/services/login-attempt.service';
import { LoginFailureReason } from '../security/enums/security.enum';

export interface LoginMeta extends Pick<AuditActorOverride, 'ipAddress' | 'userAgent'> {
  country?: string;
  city?: string;
}

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
    private readonly loginAttempts: LoginAttemptService,
  ) {}

  async validateAndLogin(
    email: string,
    password: string,
    tenantCodeOrSlug?: string,
    meta?: LoginMeta,
  ) {
    const user = await this.userRepo.findOne({
      where: { email, isActive: true },
    });

    if (!user) {
      await this.recordAttempt(email, false, LoginFailureReason.UNKNOWN_USER, meta, {
        tenantId: await this.resolveTenantId(tenantCodeOrSlug),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.recordAttempt(email, false, LoginFailureReason.INVALID_PASSWORD, meta, {
        tenantId: await this.resolveTenantId(tenantCodeOrSlug),
        userId: user.id,
      });
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
          m.tenant.status === TenantStatus.TRIAL ||
          // PAST_DUE (subscription cancelled / payment overdue) must still be
          // able to log in so the owner can reactivate the subscription.
          m.tenant.status === TenantStatus.PAST_DUE),
    );

    if (usable.length === 0) {
      await this.recordAttempt(email, false, LoginFailureReason.NO_TENANT, meta, {
        userId: user.id,
      });
      throw new ForbiddenException('No active tenant membership');
    }

    if (tenantCodeOrSlug) {
      const match = usable.find(
        (m) =>
          m.tenant.code === tenantCodeOrSlug ||
          m.tenant.slug === tenantCodeOrSlug,
      );
      if (!match) {
        await this.recordAttempt(
          email,
          false,
          LoginFailureReason.TENANT_MISMATCH,
          meta,
          {
            userId: user.id,
            tenantId: await this.resolveTenantId(tenantCodeOrSlug),
          },
        );
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

  /** Issue the same application session used by password login. */
  async issueTenantSession(
    user: User,
    membership: TenantUser,
    meta?: LoginMeta,
  ) {
    if (!membership.tenant) {
      const tenant = await this.tenantRepo.findOne({ where: { id: membership.tenantId } });
      if (!tenant) {
        throw new Error('Tenant not found for identity session');
      }
      membership.tenant = tenant;
    }
    return this.issueToken(user, membership, meta);
  }

  async switchTenant(
    userId: string,
    tenantId: string,
    meta?: LoginMeta,
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
    meta?: LoginMeta,
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

    // Security telemetry: successful login + geo baseline (never throws).
    await this.recordAttempt(user.email, true, LoginFailureReason.OK, meta, {
      tenantId: membership.tenantId,
      userId: user.id,
    });

    return result;
  }

  private async recordAttempt(
    email: string,
    success: boolean,
    reason: LoginFailureReason,
    meta: LoginMeta | undefined,
    ids: { tenantId?: string | null; userId?: string | null },
  ): Promise<void> {
    await this.loginAttempts.record({
      tenantId: ids.tenantId ?? null,
      userId: ids.userId ?? null,
      email,
      success,
      reason,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
      country: meta?.country ?? null,
      city: meta?.city ?? null,
    });
  }

  private async resolveTenantId(codeOrSlug?: string): Promise<string | null> {
    if (!codeOrSlug) return null;
    const tenant = await this.tenantRepo.findOne({
      where: [{ code: codeOrSlug }, { slug: codeOrSlug }],
    });
    return tenant?.id ?? null;
  }
}