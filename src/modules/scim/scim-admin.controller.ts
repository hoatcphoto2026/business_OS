import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { ScimAdminService } from './scim-admin.service';
import {
  CreateScimEndpointDto,
  ScimLogQueryDto,
  UpdateScimEndpointDto,
} from './dto/scim.dto';

/**
 * Tenant-admin APIs for SCIM: endpoint/token management, provisioning status,
 * DLQ retry and metrics. These use normal JWT auth (unlike /scim/v2/*).
 */
@ApiTags('SCIM Provisioning (admin)')
@ApiBearerAuth()
@Controller('scim')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class ScimAdminController {
  constructor(private readonly scim: ScimAdminService) {}

  @Post('endpoints')
  @ApiOperation({ summary: 'Create a SCIM endpoint and return its bearer token once' })
  createEndpoint(@Body() dto: CreateScimEndpointDto) {
    return this.scim.createEndpoint(dto);
  }

  @Get('endpoints')
  @ApiOperation({ summary: 'List SCIM endpoints of the current tenant' })
  listEndpoints() {
    return this.scim.listEndpoints();
  }

  @Patch('endpoints/:id')
  @ApiOperation({ summary: 'Enable/disable or reconfigure a SCIM endpoint' })
  updateEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScimEndpointDto,
  ) {
    return this.scim.updateEndpoint(id, dto);
  }

  @Post('endpoints/:id/rotate-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the bearer token (returned once)' })
  rotateToken(@Param('id', ParseUUIDPipe) id: string) {
    return this.scim.rotateToken(id);
  }

  @Get('provisioning-logs')
  @ApiOperation({ summary: 'Provisioning status tracking (filter by status)' })
  listLogs(@Query() query: ScimLogQueryDto) {
    return this.scim.listLogs(query.status, query.limit);
  }

  @Get('provisioning-logs/:id')
  @ApiOperation({ summary: 'Get one provisioning log entry' })
  getLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.scim.getLog(id);
  }

  @Post('provisioning-logs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed provisioning attempt (DLQ safe)' })
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.scim.retry(id);
  }

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4')
  @ApiOperation({ summary: 'Prometheus metrics for SCIM provisioning' })
  metrics() {
    return this.scim.metricsText();
  }
}
