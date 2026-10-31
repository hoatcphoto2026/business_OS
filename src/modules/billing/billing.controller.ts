import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { StepUpGuard } from '../administration/guards/step-up.guard';
import { RequireStepUp } from '../administration/decorators/require-step-up.decorator';

@ApiTags('Billing & Subscription')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List active subscription plans' })
  @ApiResponse({ status: 200, description: 'List of plans with features' })
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get plan by id or code' })
  @ApiParam({ name: 'id', description: 'Plan UUID or code (FREE, STARTER, ...)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  getPlan(@Param('id') id: string) {
    return this.billingService.getPlan(id);
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get current tenant subscription' })
  @ApiResponse({ status: 200, description: 'Current subscription or null' })
  getSubscription() {
    return this.billingService.getCurrentSubscription();
  }

  @Post('subscription/change-plan')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @RequireStepUp('billing.change-plan')
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Change plan or create subscription' })
  @ApiResponse({ status: 200, description: 'Updated subscription' })
  @ApiResponse({ status: 400, description: 'Invalid plan or transition' })
  changePlan(@Body() dto: ChangePlanDto) {
    return this.billingService.changePlan(dto);
  }

  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @RequireStepUp('billing.cancel')
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Cancel subscription (immediate or at period end)' })
  cancel(@Body() dto: CancelSubscriptionDto) {
    return this.billingService.cancel(dto);
  }

  @Post('subscription/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Reactivate a cancelled / expired / suspended subscription' })
  reactivate() {
    return this.billingService.reactivate();
  }
}
