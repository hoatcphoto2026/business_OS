import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AutoInvoiceService } from './auto-invoice.service';
import { GenerateAutoInvoiceDto } from './dto/generate-auto-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@ApiTags('Auto Invoice')
@ApiBearerAuth()
@Controller('auto-invoices')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('billing.manage')
export class AutoInvoiceController {
  constructor(private readonly service: AutoInvoiceService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate an automatic invoice' })
  @ApiResponse({ status: 201 })
  generate(@Body() dto: GenerateAutoInvoiceDto) {
    return this.service.generate(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List auto invoices' })
  list() {
    return this.service.list();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics for auto invoice' })
  metrics() {
    return this.service.getPrometheusText();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an auto invoice with items' })
  @ApiParam({ name: 'id' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }
}
