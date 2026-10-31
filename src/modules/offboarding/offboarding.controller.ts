import { Controller, Post, Get, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OffboardingService } from './offboarding.service';
import { StartOffboardingDto } from './dto/start-offboarding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Tenant Offboarding')
@ApiBearerAuth()
@Controller('offboarding')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('billing.manage')
export class OffboardingController {
  constructor(private readonly offboarding: OffboardingService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start tenant offboarding (export, deactivate, revoke, cancel)' })
  @ApiResponse({ status: 201, description: 'Offboarding record' })
  start(@Body() dto: StartOffboardingDto) {
    return this.offboarding.start(dto);
  }

  @Get('report/:id')
  @ApiOperation({ summary: 'Get offboarding report' })
  @ApiParam({ name: 'id', description: 'Offboarding UUID' })
  report(@Param('id') id: string) {
    return this.offboarding.getReport(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get offboarding status' })
  get(@Param('id') id: string) {
    return this.offboarding.get(id);
  }

  @Get()
  @ApiOperation({ summary: 'List offboarding requests for current tenant' })
  list() {
    return this.offboarding.list();
  }
}
