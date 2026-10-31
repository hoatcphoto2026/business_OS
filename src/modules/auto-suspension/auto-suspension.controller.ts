import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AutoSuspensionService } from './auto-suspension.service';
import { TriggerSuspensionDto } from './dto/trigger-suspension.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Auto Suspension')
@ApiBearerAuth()
@Controller('suspensions')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('billing.manage')
export class AutoSuspensionController {
  constructor(private readonly service: AutoSuspensionService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger automatic suspension' })
  @ApiResponse({ status: 201 })
  trigger(@Body() dto: TriggerSuspensionDto) {
    return this.service.trigger(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List suspension records' })
  list() {
    return this.service.list();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for auto suspension' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a suspension record' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed suspension' })
  retry(@Param('id') id: string) {
    return this.service.retry(id);
  }
}
