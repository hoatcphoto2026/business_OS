import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryOrder } from './entities/delivery-order.entity';
import { DeliveryTrackingEvent } from './entities/delivery-tracking-event.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(DeliveryOrder) private readonly orderRepo: Repository<DeliveryOrder>,
    @InjectRepository(DeliveryTrackingEvent) private readonly eventRepo: Repository<DeliveryTrackingEvent>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async trackByShippingNo(shippingNo: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const order = await this.orderRepo.findOne({ where: { tenantId, shippingNo } });
    if (!order) throw new NotFoundException('Shipment not found');
    const events = await this.eventRepo.find({
      where: { deliveryOrderId: order.id },
      order: { createdAt: 'ASC' },
    });
    return { order, events };
  }
}
