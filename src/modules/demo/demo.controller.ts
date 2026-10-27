import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@Controller('demo')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
export class DemoController {
  @Post('sales-orders')
  @RequirePermission('sales.create')
  createSalesOrder() {
    return { ok: true, message: 'Sales order created' };
  }

  @Get('profit-report')
  @RequirePermission('profit.view')
  getProfitReport() {
    return { ok: true, profit: 125000000 };
  }

  @Post('inventory-adjustment')
  @RequirePermission('inventory.update')
  adjustInventory() {
    return { ok: true, message: 'Inventory adjusted' };
  }

  @Get('bank')
  @RequirePermission('bank.view')
  getBank() {
    return { ok: true, accounts: [] };
  }
}
