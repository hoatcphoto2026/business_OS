import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreatePaymentDto, RefundDto, WebhookDto } from './dto/payment.dto';
import { BankingWebhookDto } from './dto/banking-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { StepUpGuard } from '../administration/guards/step-up.guard';
import { RequireStepUp } from '../administration/decorators/require-step-up.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('billing/payment')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('billing.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a payment' })
  create(@Body() dto: CreatePaymentDto) {
    return this.payments.create(dto);
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard, StepUpGuard)
  @RequireStepUp('billing.refund')
  @RequirePermission('billing.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a payment' })
  refund(@Body() dto: RefundDto) {
    return this.payments.refund(dto);
  }

  @Post('webhook/banking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Banking transfer confirmation webhook' })
  bankingWebhook(@Body() dto: BankingWebhookDto) {
    return this.payments.handleBankingWebhook(dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Provider webhook (signature verified)' })
  webhook(@Body() dto: WebhookDto) {
    return this.payments.handleWebhook(dto);
  }
}
