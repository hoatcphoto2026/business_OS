import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

@Injectable()
export class ReportingService {
  constructor(
    @InjectRepository(SalesOrder) private readonly orderRepo: Repository<SalesOrder>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async revenueReport(from?: string, to?: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total_amount), 0)', 'totalRevenue')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(AVG(o.total_amount), 0)', 'averageOrderValue')
      .where('o.tenant_id = :tenantId', { tenantId });

    if (from) qb.andWhere('o.order_date >= :from', { from });
    if (to) qb.andWhere('o.order_date <= :to', { to });

    const row = await qb.getRawOne();
    return {
      from: from || null,
      to: to || null,
      totalRevenue: Number(row?.totalRevenue ?? 0),
      orderCount: Number(row?.orderCount ?? 0),
      averageOrderValue: Math.round(Number(row?.averageOrderValue ?? 0)),
    };
  }
}
