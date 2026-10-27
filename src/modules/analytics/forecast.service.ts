import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

@Injectable()
export class ForecastService {
  constructor(
    @InjectRepository(SalesOrder) private readonly orderRepo: Repository<SalesOrder>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async revenueForecast(days = 30) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select("DATE(o.order_date)", 'date')
      .addSelect('COALESCE(SUM(o.total_amount), 0)', 'revenue')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.order_date >= CURRENT_DATE - :days::int', { days })
      .groupBy('DATE(o.order_date)')
      .orderBy('date', 'ASC')
      .getRawMany();

    const revenues = rows.map((r) => Number(r.revenue));
    const avg = revenues.length ? revenues.reduce((a, b) => a + b, 0) / revenues.length : 0;
    const recent = revenues.slice(-7);
    const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;

    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (recentAvg > avg * 1.05) trend = 'up';
    else if (recentAvg < avg * 0.95) trend = 'down';

    return {
      periodDays: days,
      averageDailyRevenue: Math.round(avg),
      recent7DayAverage: Math.round(recentAvg),
      projectedNext30Days: Math.round(recentAvg * 30),
      trend,
      dataPoints: rows.length,
    };
  }
}
