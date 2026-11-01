import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PlatformOperatorGuard } from '../executive/platform-operator.guard';
import { GrowthService } from './growth.service';
import { ExperimentStatus } from './enums/growth.enum';
import {
  CreateExperimentDto,
  GenerateGrowthSnapshotDto,
  GrowthSegmentQueryDto,
  GrowthSnapshotQueryDto,
  GrowthWindowDto,
  UpdateExperimentDto,
} from './dto/growth.dto';

/** EPIC D5 – Growth Intelligence (operator-only, platform-wide). */
@ApiTags('Growth Intelligence')
@ApiBearerAuth()
@Controller('growth')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, PlatformOperatorGuard)
@RequirePermission('admin.access')
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get()
  @ApiOperation({ summary: 'Growth dashboard: KPIs, funnel, sources, plan funnel, experiments' })
  dashboard() {
    return this.growth.dashboard();
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Conversion funnel + plan upgrade funnel' })
  funnel(@Query() query: GrowthWindowDto) {
    return this.growth.funnel(query);
  }

  @Get('conversions')
  @ApiOperation({ summary: 'Trial/paid conversion, expansion, upsell, activation, onboarding' })
  conversions(@Query() query: GrowthWindowDto) {
    return this.growth.conversions(query);
  }

  @Get('segments')
  @ApiOperation({ summary: 'Growth segments by acquisition source or plan' })
  segments(@Query() query: GrowthSegmentQueryDto) {
    return this.growth.listSegments(query);
  }

  @Get('experiments')
  @ApiOperation({ summary: 'List growth experiments' })
  @ApiQuery({ name: 'status', required: false, enum: ExperimentStatus })
  experiments(@Query('status') status?: ExperimentStatus) {
    return this.growth.listExperiments(status);
  }

  @Post('experiments')
  @ApiOperation({ summary: 'Create a growth experiment (conversion A/B + uplift)' })
  createExperiment(@Body() dto: CreateExperimentDto) {
    return this.growth.createExperiment(dto);
  }

  @Patch('experiments/:id')
  @ApiOperation({ summary: 'Update experiment status/results and recompute uplift' })
  updateExperiment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExperimentDto,
  ) {
    return this.growth.updateExperiment(id, dto);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List growth snapshots (daily / monthly)' })
  snapshots(@Query() query: GrowthSnapshotQueryDto) {
    return this.growth.listSnapshots(query);
  }

  @Post('snapshots')
  @ApiOperation({ summary: 'Generate a growth snapshot + source/plan segments' })
  generate(@Body() dto: GenerateGrowthSnapshotDto) {
    return this.growth.generateSnapshot(dto);
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus gauges for growth intelligence' })
  metrics() {
    return this.growth.prometheusText();
  }
}
