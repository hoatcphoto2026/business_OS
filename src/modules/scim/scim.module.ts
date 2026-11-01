import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScimController } from './scim.controller';
import { ScimAdminController } from './scim-admin.controller';
import { ScimProvisioningService } from './scim-provisioning.service';
import { ScimUsersService } from './scim-users.service';
import { ScimGroupsService } from './scim-groups.service';
import { ScimAdminService } from './scim-admin.service';
import { ScimBulkService } from './scim-bulk.service';
import { ScimAuthGuard } from './scim-auth.guard';
import { ScimEndpoint } from './entities/scim-endpoint.entity';
import { ScimMapping } from './entities/scim-mapping.entity';
import { ScimProvisioningLog } from './entities/scim-provisioning-log.entity';
import { User } from '../users/entities/user.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { Role } from '../rbac/entities/role.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { EnterpriseOrganization } from '../organization/entities/enterprise-organization.entity';
import { EnterpriseDepartment } from '../organization/entities/enterprise-department.entity';
import { OrgMembership } from '../organization/entities/org-membership.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TenantModule,
    RbacModule,
    AuditModule,
    TypeOrmModule.forFeature([
      ScimEndpoint,
      ScimMapping,
      ScimProvisioningLog,
      User,
      TenantUser,
      Role,
      UserRole,
      EnterpriseOrganization,
      EnterpriseDepartment,
      OrgMembership,
    ]),
  ],
  controllers: [ScimController, ScimAdminController],
  providers: [
    ScimProvisioningService,
    ScimUsersService,
    ScimGroupsService,
    ScimBulkService,
    ScimAdminService,
    ScimAuthGuard,
  ],
  exports: [ScimAdminService],
})
export class ScimModule {}
