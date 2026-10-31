import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { CreateIdentityProviderDto, IdentityCallbackDto } from './dto/identity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Enterprise Identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('providers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('admin.access')
  @ApiOperation({ summary: 'Register an OIDC, Google, Entra ID, or SAML-ready provider' })
  create(@Body() dto: CreateIdentityProviderDto) {
    return this.identity.createProvider(dto);
  }

  @Get('providers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('admin.access')
  @ApiOperation({ summary: 'List identity providers for the current tenant' })
  list() {
    return this.identity.listProviders();
  }

  @Post('providers/:id/enable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('admin.access')
  @ApiOperation({ summary: 'Enable a provider' })
  enable(@Param('id', ParseUUIDPipe) id: string) {
    return this.identity.setEnabled(id, true);
  }

  @Post('providers/:id/disable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('admin.access')
  @ApiOperation({ summary: 'Disable a provider' })
  disable(@Param('id', ParseUUIDPipe) id: string) {
    return this.identity.setEnabled(id, false);
  }

  @Get('providers/:code/discovery')
  @ApiOperation({ summary: 'OIDC discovery or SAML-ready metadata' })
  discovery(@Param('code') code: string, @Query('tenant') tenant: string) {
    return this.identity.discovery(code, tenant);
  }

  @Get('login/:code')
  @ApiOperation({ summary: 'Start Google, Entra ID, or OIDC login' })
  login(@Param('code') code: string, @Query('tenant') tenant: string, @Req() req: { traceId?: string }) {
    return this.identity.startLogin(code, tenant, req.traceId);
  }

  @Post('callback')
  @ApiOperation({ summary: 'Complete OIDC login, JIT-provision the user, and open an application session' })
  callback(
    @Body() dto: IdentityCallbackDto,
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const agent = req.headers?.['user-agent'];
    return this.identity.callback(dto, {
      ipAddress: req.ip ?? null,
      userAgent: Array.isArray(agent) ? agent[0] : agent ?? null,
    });
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('admin.access')
  @ApiOperation({ summary: 'SSO session tracking' })
  sessions() {
    return this.identity.listSessions();
  }

  @Get('metrics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('admin.access')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics for enterprise identity' })
  metrics() {
    return this.identity.metrics();
  }
}
