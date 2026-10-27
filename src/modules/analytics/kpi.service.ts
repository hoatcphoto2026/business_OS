import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../sales-orders/entities/sales-order.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { Supplier } from '../master-data/entities/supplier.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

@Injectable()
export class KpiService {
  constructor(
    @InjectRepository(SalesOrder) private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getKpis() {
    const tenantId = this.tenantContext.getCurrentTenantId();

    const [orderCount, customerCount, productCount, supplierCount] = await Promise.all([
      this.orderRepo.count({ where: { tenantId } }),
      this.customerRepo.count({ where: { tenantId, status: 'active' } }),
      this.productRepo.count({ where: { tenantId, active: true } }),
      this.supplierRepo.count({ where: { tenantId, status: 'active' } }),
    ]);

    const revenueResult = await this.orderRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total_amount), 0)', 'total')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.status != :cancelled', { cancelled: 'cancelled' })
      .getRawOne();

    const totalRevenue = Number(revenueResult?.total ?? 0);
    const averageOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

    return {
      totalRevenue,
      orderCount,
      customerCount,
      productCount,
      supplierCount,
      averageOrderValue,
    };
  }
}
