import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { Branch } from './entities/branch.entity';
import { Department } from './entities/department.entity';
import { UserCompany } from './entities/user-company.entity';
import { UserBranch } from './entities/user-branch.entity';
import { UserDepartment } from './entities/user-department.entity';
import { EnterpriseOrganization } from './entities/enterprise-organization.entity';
import { EnterpriseDepartment } from './entities/enterprise-department.entity';
import { EnterpriseTeam } from './entities/enterprise-team.entity';
import { CostCenter } from './entities/cost-center.entity';
import { OrgMembership } from './entities/org-membership.entity';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { EnterpriseOrgService } from './enterprise-org.service';
import { EnterpriseOrgController } from './enterprise-org.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TenantModule,
    RbacModule, // provides TenantGuard + Tenant/TenantUser repositories
    AuditModule,
    TypeOrmModule.forFeature([
      Company,
      Branch,
      Department,
      UserCompany,
      UserBranch,
      UserDepartment,
      EnterpriseOrganization,
      EnterpriseDepartment,
      EnterpriseTeam,
      CostCenter,
      OrgMembership,
    ]),
  ],
  controllers: [OrganizationController, EnterpriseOrgController],
  providers: [OrganizationService, EnterpriseOrgService],
  exports: [OrganizationService, EnterpriseOrgService, TypeOrmModule],
})
export class OrganizationModule {}
