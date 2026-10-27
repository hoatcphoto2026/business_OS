import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';
import { ScopeAwareRepository } from '../../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../../scope/scope.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);
  private readonly repo: ScopeAwareRepository<Supplier>;

  constructor(
    @InjectRepository(Supplier) repo: Repository<Supplier>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(repo, tenantContext, scopeService, 'supplier');
  }

  async findAll() { return this.repo.findAll({ order: { createdAt: 'DESC' } as any }); }

  async findById(id: string) {
    const e = await this.repo.findById(id);
    if (!e) throw new NotFoundException('Supplier not found');
    return e;
  }

  async create(data: Partial<Supplier>) {
    const saved = await this.repo.save(this.repo.create(data as any));
    await this.eventBus.publish(EventType.SupplierCreated, 'supplier', saved.id, { name: saved.name, code: saved.code });
    await this.eventBus.publish(EventType.MasterDataChanged, 'supplier', saved.id, { action: 'created' });
    return saved;
  }

  async update(id: string, data: Partial<Supplier>) {
    const existing = await this.findById(id);
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.SupplierUpdated, 'supplier', saved.id, { name: saved.name });
    await this.eventBus.publish(EventType.MasterDataChanged, 'supplier', saved.id, { action: 'updated' });
    return saved;
  }

  async softDelete(id: string) {
    const existing = await this.findById(id);
    existing.status = 'inactive';
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.SupplierDeleted, 'supplier', saved.id, {});
    return saved;
  }
}
