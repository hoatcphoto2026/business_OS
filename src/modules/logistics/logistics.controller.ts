import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { DeliveryOrderService } from './delivery-order.service';
import { TrackingService } from './tracking.service';
import { CarrierService } from './carrier.service';
import { CodService } from './cod.service';
import { DeliveryStatus } from './enums/delivery-status.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@Controller('logistics')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionGuard)
@RequirePermission('admin.access')
export class LogisticsController {
  constructor(
    private readonly delivery: DeliveryOrderService,
    private readonly tracking: TrackingService,
    private readonly carriers: CarrierService,
    private readonly cod: CodService,
  ) {}

  @Get('delivery-orders')
  listOrders() { return this.delivery.list(); }

  @Post('delivery-orders')
  createOrder(@Body() body: any) { return this.delivery.create(body); }

  @Get('delivery-orders/:id')
  getOrder(@Param('id') id: string) { return this.delivery.findById(id); }

  @Post('delivery-orders/:id/assign')
  assign(@Param('id') id: string, @Body() body: { carrierCode: string }) {
    return this.delivery.assignCarrier(id, body.carrierCode);
  }

  @Put('delivery-orders/:id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: DeliveryStatus; description?: string }) {
    return this.delivery.updateStatus(id, body.status, body.description);
  }

  @Get('tracking/:shippingNo')
  track(@Param('shippingNo') shippingNo: string) { return this.tracking.trackByShippingNo(shippingNo); }

  @Get('carriers')
  listCarriers() { return this.carriers.list(); }

  @Get('cod')
  listCod() { return this.cod.list(); }

  @Post('cod/:id/settle')
  settleCod(@Param('id') id: string) { return this.cod.settle(id); }
}
