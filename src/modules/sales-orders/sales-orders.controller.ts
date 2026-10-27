import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto, UpdateSalesOrderDto } from './dto/sales-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Audited } from '../audit/decorators/audited.decorator';

@Controller('sales-orders')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Get()
  @RequirePermission('sales.view')
  findAll() {
    return this.salesOrdersService.findAll();
  }

  @Get(':id')
  @RequirePermission('sales.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesOrdersService.findById(id);
  }

  @Post()
  @Audited({ entityType: 'sales_order' })
  @RequirePermission('sales.create')
  create(@Body() body: CreateSalesOrderDto) {
    return this.salesOrdersService.create(body);
  }

  @Patch(':id')
  @Audited({ entityType: 'sales_order' })
  @RequirePermission('sales.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSalesOrderDto,
  ) {
    return this.salesOrdersService.update(id, body);
  }

  @Delete(':id')
  @Audited({ entityType: 'sales_order' })
  @RequirePermission('sales.delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesOrdersService.remove(id);
  }
}
