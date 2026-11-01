import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityProvider } from './entities/identity-provider.entity';
import { IdentityMapping } from './entities/identity-mapping.entity';
import { SSOSession } from './entities/sso-session.entity';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { SsoSessionCleanupJob } from './jobs/sso-session-cleanup.job';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { Role } from '../rbac/entities/role.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IdentityProvider,
      IdentityMapping,
      SSOSession,
      User,
      Tenant,
      TenantUser,
      Role,
      UserRole,
    ]),
    AuthModule,
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [IdentityController],
  providers: [IdentityService, SsoSessionCleanupJob],
  exports: [IdentityService, SsoSessionCleanupJob],
})
export class IdentityModule {}
