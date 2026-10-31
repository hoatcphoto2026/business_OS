import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CustomerPortalService } from './customer-portal.service';
import { ChangePlanDto } from '../billing/dto/change-plan.dto';
import { CancelSubscriptionDto } from '../billing/dto/cancel-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { StepUpGuard } from '../administration/guards/step-up.guard';
import { RequireStepUp } from '../administration/decorators/require-step-up.decorator';

@ApiTags('Customer Portal')
@ApiBearerAuth()
@Controller('portal')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class CustomerPortalController {
  constructor(private readonly portal: CustomerPortalService) {}

  @Get('dashboard')
  @RequirePermission('billing.view')
  @ApiOperation({ summary: 'Customer portal dashboard (plan, status, usage, recent activity)' })
  @ApiResponse({ status: 200, description: 'Aggregated dashboard data' })
  dashboard() {
    return this.portal.getDashboard();
  }

  @Get('subscription')
  @RequirePermission('billing.view')
  @ApiOperation({ summary: 'View current subscription and plan' })
  getSubscription() {
    return this.portal.getSubscription();
  }

  @Post('subscription/change-plan')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @RequireStepUp('billing.change-plan')
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Upgrade or downgrade plan (OWNER only via billing.manage)' })
  changePlan(@Body() dto: ChangePlanDto) {
    return this.portal.changePlan(dto);
  }

  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @RequireStepUp('billing.cancel')
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Cancel subscription (OWNER only)' })
  cancel(@Body() dto: CancelSubscriptionDto) {
    return this.portal.cancel(dto);
  }

  @Post('subscription/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Reactivate subscription (OWNER only)' })
  reactivate() {
    return this.portal.reactivate();
  }

  @Get('invoices')
  @RequirePermission('billing.view')
  @ApiOperation({ summary: 'List invoices for the tenant' })
  listInvoices() {
    return this.portal.listInvoices();
  }

  @Get('invoices/:id')
  @RequirePermission('billing.view')
  @ApiOperation({ summary: 'Get invoice details' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  getInvoice(@Param('id') id: string) {
    return this.portal.getInvoice(id);
  }

  @Get('invoices/:id/pdf')
  @RequirePermission('billing.view')
  @ApiOperation({ summary: 'Download invoice as PDF' })
  @ApiProduces('application/pdf')
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  async downloadInvoicePdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.portal.generateInvoicePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  @Get('payments')
  @RequirePermission('billing.view')
  @ApiOperation({ summary: 'Payment history for the tenant' })
  listPayments() {
    return this.portal.listPayments();
  }

  @Get('usage')
  @RequirePermission('billing.view')
  @ApiOperation({
    summary: 'Usage vs limits (Active Users, API Calls, Webhooks, Storage, AI Requests)',
  })
  getUsage() {
    return this.portal.getUsage();
  }
}
