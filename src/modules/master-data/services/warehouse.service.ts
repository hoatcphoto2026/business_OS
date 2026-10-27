import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from '../entities/warehouse.entity';
import { ScopeAwareRepository } from '../../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../../scope/scope.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);
  private readonly repo: ScopeAwareRepository<Warehouse>;

  constructor(
    @InjectRepository(Warehouse) repo: Repository<Warehouse>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(repo, tenantContext, scopeService, 'warehouse');
  }

  async findAll() { return this.repo.findAll({ order: { createdAt: 'DESC' } as any }); }
  async findById(id: string) {
    const e = await this.repo.findById(id);
    if (!e) throw new NotFoundException('Warehouse not found');
    return e;
  }
  async create(data: Partial<Warehouse>) {
    const saved = await this.repo.save(this.repo.create(data as any));
    const et = (EventType as any)['WarehouseCreated'] || EventType.MasterDataChanged;
    await this.eventBus.publish(et, 'warehouse', saved.id, { action: 'created' });
    await this.eventBus.publish(EventType.MasterDataChanged, 'warehouse', saved.id, { action: 'created' });
    return saved;
  }
  async update(id: string, data: Partial<Warehouse>) {
    const existing = await this.findById(id);
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.MasterDataChanged, 'warehouse', saved.id, { action: 'updated' });
    return saved;
  }
  async softDelete(id: string) {
    const existing = await this.findById(id);
    (existing as any).status = 'inactive';
    return this.repo.save(existing);
  }
}
