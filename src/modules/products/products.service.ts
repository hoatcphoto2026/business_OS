import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ScopeAwareRepository } from '../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../scope/scope.service';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly repo: ScopeAwareRepository<Product>;

  constructor(
    @InjectRepository(Product) productRepo: Repository<Product>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(productRepo, tenantContext, scopeService, 'product');
  }

  async findAll(): Promise<Product[]> {
    return this.repo.findAll({ order: { createdAt: 'DESC' } as any });
  }

  async findById(id: string): Promise<Product> {
    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(data: Partial<Product>): Promise<Product> {
    const entity = this.repo.create(this.writable(data));
    const saved = await this.repo.save(entity);
    await this.eventBus.publish(EventType.ProductCreated, 'product', saved.id, { name: saved.name, sku: saved.sku });
    await this.eventBus.publish(EventType.MasterDataChanged, 'product', saved.id, { action: 'created' });
    return saved;
  }

  async update(id: string, data: Partial<Product>): Promise<Product> {
    const existing = await this.findById(id);
    Object.assign(existing, this.writable(data));
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.ProductUpdated, 'product', saved.id, { name: saved.name });
    await this.eventBus.publish(EventType.MasterDataChanged, 'product', saved.id, { action: 'updated' });
    return saved;
  }

  async softDelete(id: string): Promise<Product> {
    const existing = await this.findById(id);
    existing.active = false;
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.ProductDeleted, 'product', saved.id, {});
    await this.eventBus.publish(EventType.MasterDataChanged, 'product', saved.id, { action: 'deleted' });
    return saved;
  }

  async remove(id: string) { return this.softDelete(id); }

  private writable(data: Partial<Product>): Partial<Product> {
    const source = data as Record<string, unknown>;
    const { id: _id, tenantId: _t, ownerId: _o, companyId: _c, branchId: _b, createdBy: _cb, updatedBy: _ub, createdAt: _ca, updatedAt: _ua, ...rest } = source;
    return rest as Partial<Product>;
  }
}
