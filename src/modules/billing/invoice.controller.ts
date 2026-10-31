import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Billing Invoices')
@ApiBearerAuth()
@Controller('billing/invoices')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices for current tenant' })
  list() {
    return this.invoices.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Generate invoice for current subscription' })
  generate(@Body() dto: GenerateInvoiceDto) {
    return this.invoices.generate(dto);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('billing.manage')
  @ApiOperation({ summary: 'Void an invoice' })
  void(@Param('id') id: string) {
    return this.invoices.void(id);
  }
}
