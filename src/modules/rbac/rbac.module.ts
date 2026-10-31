import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole } from './entities/user-role.entity';
import { AuthorizationService } from './authorization.service';
import { PermissionGuard } from './guards/permission.guard';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { TenantModule } from '../tenant/tenant.module';
import { TenantUser } from '../tenant/entities/tenant-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Permission, Role, RolePermission, UserRole, TenantUser]),
    TenantModule,
  ],
  controllers: [RbacController],
  providers: [AuthorizationService, PermissionGuard, RbacService],
  exports: [AuthorizationService, PermissionGuard],
})
export class RbacModule {}
