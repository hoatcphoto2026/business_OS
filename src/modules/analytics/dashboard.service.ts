import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { KpiService } from './kpi.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(SalesOrder) private readonly orderRepo: Repository<SalesOrder>,
    private readonly tenantContext: TenantContextService,
    private readonly kpiService: KpiService,
  ) {}

  async getDashboard() {
    const kpis = await this.kpiService.getKpis();
    const revenueByDay = await this.revenueByDay(30);
    const topCustomers = await this.topCustomers(5);

    return {
      kpis,
      charts: {
        revenueByDay,
        topCustomers,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async revenueByDay(days: number) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select("DATE(o.order_date)", 'date')
      .addSelect('COALESCE(SUM(o.total_amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'orders')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.order_date >= CURRENT_DATE - :days::int', { days })
      .groupBy('DATE(o.order_date)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    }));
  }

  private async topCustomers(limit: number) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoin('customers', 'c', 'c.id = o.customer_id')
      .select('o.customer_id', 'customerId')
      .addSelect('c.name', 'customerName')
      .addSelect('COALESCE(SUM(o.total_amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'orders')
      .where('o.tenant_id = :tenantId', { tenantId })
      .groupBy('o.customer_id')
      .addGroupBy('c.name')
      .orderBy('revenue', 'DESC')
      .limit(limit)
      .getRawMany();

    return rows.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName || 'Unknown',
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    }));
  }
}
