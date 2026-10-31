import { Controller, Post, Get, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RuleEngineService } from './rule-engine.service';
import { CreateRuleDto, EvaluateRuleDto } from './dto/rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Rule Engine')
@ApiBearerAuth()
@Controller('rules')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class RuleEngineController {
  constructor(private readonly service: RuleEngineService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a rule definition (with versioning)' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateRuleDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List rules for current tenant' })
  list() {
    return this.service.list();
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate rules against input context' })
  evaluate(@Body() dto: EvaluateRuleDto) {
    return this.service.evaluate(dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'List rule execution history' })
  @ApiQuery({ name: 'ruleId', required: false })
  history(@Query('ruleId') ruleId?: string) {
    return this.service.listHistory(ruleId);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for rule engine' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a rule with conditions and actions' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable a rule' })
  enable(@Param('id') id: string) {
    return this.service.setEnabled(id, true);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable a rule' })
  disable(@Param('id') id: string) {
    return this.service.setEnabled(id, false);
  }
}
