import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from '../entities/currency.entity';
import { ScopeAwareRepository } from '../../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../../scope/scope.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private readonly repo: ScopeAwareRepository<Currency>;

  constructor(
    @InjectRepository(Currency) repo: Repository<Currency>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(repo, tenantContext, scopeService, 'currency');
  }

  async findAll() { return this.repo.findAll({ order: { createdAt: 'DESC' } as any }); }
  async findById(id: string) {
    const e = await this.repo.findById(id);
    if (!e) throw new NotFoundException('Currency not found');
    return e;
  }
  async create(data: Partial<Currency>) {
    const saved = await this.repo.save(this.repo.create(data as any));
    const et = (EventType as any)['CurrencyCreated'] || EventType.MasterDataChanged;
    await this.eventBus.publish(et, 'currency', saved.id, { action: 'created' });
    await this.eventBus.publish(EventType.MasterDataChanged, 'currency', saved.id, { action: 'created' });
    return saved;
  }
  async update(id: string, data: Partial<Currency>) {
    const existing = await this.findById(id);
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.MasterDataChanged, 'currency', saved.id, { action: 'updated' });
    return saved;
  }
  async softDelete(id: string) {
    const existing = await this.findById(id);
    (existing as any).status = 'inactive';
    return this.repo.save(existing);
  }
}
