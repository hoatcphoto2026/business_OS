import { Injectable } from '@nestjs/common';
import { KpiService } from './kpi.service';

@Injectable()
export class MetricsService {
  constructor(private readonly kpiService: KpiService) {}

  async getMetrics() {
    const kpis = await this.kpiService.getKpis();
    return {
      customerGrowthRate: null, // requires historical snapshot
      orderGrowthRate: null,
      revenuePerCustomer: kpis.customerCount > 0 ? Math.round(kpis.totalRevenue / kpis.customerCount) : 0,
      averageOrderValue: kpis.averageOrderValue,
      inventoryHealth: 'unknown',
      generatedAt: new Date().toISOString(),
    };
  }
}
