import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodSettlement } from './entities/cod-settlement.entity';
import { DeliveryOrder } from './entities/delivery-order.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';

@Injectable()
export class CodService {
  constructor(
    @InjectRepository(CodSettlement) private readonly repo: Repository<CodSettlement>,
    @InjectRepository(DeliveryOrder) private readonly orderRepo: Repository<DeliveryOrder>,
    private readonly tenantContext: TenantContextService,
    private readonly eventBus: EventBus,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createFromDelivery(deliveryOrderId: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const order = await this.orderRepo.findOne({ where: { id: deliveryOrderId, tenantId } });
    if (!order || !order.codAmount) return null;
    const entity = this.repo.create({
      tenantId,
      deliveryOrderId,
      carrier: order.carrierCode || 'UNKNOWN',
      codAmount: order.codAmount,
      status: 'pending',
    });
    const saved = await this.repo.save(entity);
    return saved;
  }

  async settle(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const s = await this.repo.findOne({ where: { id, tenantId } });
    if (!s) return null;
    s.status = 'settled';
    s.settlementDate = new Date().toISOString().slice(0, 10);
    const saved = await this.repo.save(s);
    await this.eventBus.publish(EventType.CodSettled, 'cod_settlement', saved.id, { amount: saved.codAmount });
    return saved;
  }
}
