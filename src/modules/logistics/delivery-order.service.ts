import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryOrder } from './entities/delivery-order.entity';
import { DeliveryTrackingEvent } from './entities/delivery-tracking-event.entity';
import { DeliveryStatus } from './enums/delivery-status.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';
import { MockCarrierProvider } from './providers/mock.provider';

@Injectable()
export class DeliveryOrderService {
  private readonly logger = new Logger(DeliveryOrderService.name);

  constructor(
    @InjectRepository(DeliveryOrder) private readonly repo: Repository<DeliveryOrder>,
    @InjectRepository(DeliveryTrackingEvent) private readonly trackingRepo: Repository<DeliveryTrackingEvent>,
    private readonly tenantContext: TenantContextService,
    private readonly eventBus: EventBus,
    private readonly mockProvider: MockCarrierProvider,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findById(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const o = await this.repo.findOne({ where: { id, tenantId } });
    if (!o) throw new NotFoundException('Delivery order not found');
    return o;
  }

  async create(data: Partial<DeliveryOrder>) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.tryGetUserId();
    const entity = this.repo.create({
      ...data,
      tenantId,
      status: DeliveryStatus.CREATED,
      createdBy: userId,
      updatedBy: userId,
    });
    const saved = await this.repo.save(entity);

    await this.addTracking(saved.id, DeliveryStatus.CREATED, 'Delivery order created');
    await this.eventBus.publish(EventType.DeliveryOrderCreated, 'delivery_order', saved.id, {
      shippingNo: saved.shippingNo,
      recipientName: saved.recipientName,
    });

    return saved;
  }

  async assignCarrier(id: string, carrierCode: string) {
    const order = await this.findById(id);
    const result = await this.mockProvider.createShipment({
      deliveryOrderId: order.id,
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone ?? undefined,
      recipientAddress: order.recipientAddress,
      codAmount: Number(order.codAmount),
    });

    order.carrierCode = carrierCode;
    order.shippingNo = result.shippingNo;
    order.shippingFee = result.fee;
    order.status = DeliveryStatus.ASSIGNED;
    order.updatedBy = this.tenantContext.tryGetUserId();
    const saved = await this.repo.save(order);

    await this.addTracking(saved.id, DeliveryStatus.ASSIGNED, `Assigned to ${carrierCode}, shippingNo=${result.shippingNo}`);
    await this.eventBus.publish(EventType.CarrierAssigned, 'delivery_order', saved.id, { carrierCode, shippingNo: result.shippingNo });
    await this.eventBus.publish(EventType.ShipmentCreated, 'delivery_order', saved.id, { shippingNo: result.shippingNo });

    return saved;
  }

  async updateStatus(id: string, status: DeliveryStatus, description?: string) {
    const order = await this.findById(id);
    order.status = status;
    order.updatedBy = this.tenantContext.tryGetUserId();
    const saved = await this.repo.save(order);
    await this.addTracking(saved.id, status, description || `Status changed to ${status}`);

    const eventMap: Partial<Record<DeliveryStatus, EventType>> = {
      [DeliveryStatus.PICKED_UP]: EventType.ShipmentPickedUp,
      [DeliveryStatus.DELIVERED]: EventType.ShipmentDelivered,
      [DeliveryStatus.RETURNED]: EventType.ShipmentReturned,
    };
    const et = eventMap[status];
    if (et) {
      await this.eventBus.publish(et, 'delivery_order', saved.id, { status, shippingNo: saved.shippingNo });
    }
    return saved;
  }

  private async addTracking(deliveryOrderId: string, status: string, description: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    await this.trackingRepo.save(
      this.trackingRepo.create({ tenantId, deliveryOrderId, status, description }),
    );
  }
}
