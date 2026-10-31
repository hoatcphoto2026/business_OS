import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { AskDto, AnalyzeDto } from './dto/copilot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { FeatureGuard } from '../feature/guards/feature.guard';
import { RequireFeature } from '../feature/decorators/require-feature.decorator';

@Controller('copilot')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, FeatureGuard)
@RequireFeature('business_copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('ask')
  @RequireFeature('business_copilot_ai')
  @RequirePermission('customer.view')
  ask(@Body() body: AskDto) {
    return this.copilotService.ask(body.question);
  }

  @Post('analyze')
  @RequireFeature('business_copilot_ai')
  @RequirePermission('customer.view')
  analyze(@Body() body: AnalyzeDto) {
    return this.copilotService.analyze(body.analysisType ?? 'business-health');
  }

  @Post('recommend')
  @RequireFeature('business_copilot_ai')
  @RequirePermission('customer.view')
  recommend() {
    return this.copilotService.recommend();
  }

  @Get('dashboard')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.access')
  dashboard() {
    return this.copilotService.dashboard();
  }

  @Get('ceo-summary')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.access')
  @RequireFeature('business_copilot_ai')
  ceoSummary() {
    return this.copilotService.ceoSummary();
  }
}
