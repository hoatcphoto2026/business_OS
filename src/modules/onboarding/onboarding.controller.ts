import { Controller, Post, Get, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Tenant Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start tenant onboarding (create tenant + owner + trial + welcome)' })
  @ApiResponse({ status: 201, description: 'Onboarding record (PENDING or COMPLETED or FAILED)' })
  start(@Body() dto: StartOnboardingDto) {
    return this.onboarding.start(dto);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a FAILED onboarding' })
  @ApiParam({ name: 'id', description: 'Onboarding UUID' })
  retry(@Param('id') id: string) {
    return this.onboarding.retry(id);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for onboarding' })
  metrics() {
    return this.onboarding.getPrometheusText();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get onboarding status' })
  get(@Param('id') id: string) {
    return this.onboarding.get(id);
  }

  @Get()
  @ApiOperation({ summary: 'List recent onboardings' })
  list() {
    return this.onboarding.list();
  }
}
