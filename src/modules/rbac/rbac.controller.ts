import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { RbacService } from './rbac.service';

@Controller('rbac')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  getRoles(@Req() req: any) {
    return this.rbacService.findAllRoles(req.user.tenantId);
  }

  @Get('permissions')
  getPermissions() {
    return this.rbacService.findAllPermissions();
  }

  @Get('my-permissions')
  getMyPermissions(@Req() req: any) {
    return this.rbacService.getUserPermissions(req.user.userId, req.user.tenantId);
  }
}
