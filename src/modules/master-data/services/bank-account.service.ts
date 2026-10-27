import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from '../entities/bank-account.entity';
import { ScopeAwareRepository } from '../../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../../scope/scope.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class BankAccountService {
  private readonly logger = new Logger(BankAccountService.name);
  private readonly repo: ScopeAwareRepository<BankAccount>;

  constructor(
    @InjectRepository(BankAccount) repo: Repository<BankAccount>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(repo, tenantContext, scopeService, 'bank-account');
  }

  async findAll() { return this.repo.findAll({ order: { createdAt: 'DESC' } as any }); }
  async findById(id: string) {
    const e = await this.repo.findById(id);
    if (!e) throw new NotFoundException('BankAccount not found');
    return e;
  }
  async create(data: Partial<BankAccount>) {
    const saved = await this.repo.save(this.repo.create(data as any));
    const et = (EventType as any)['BankAccountCreated'] || EventType.MasterDataChanged;
    await this.eventBus.publish(et, 'bank-account', saved.id, { action: 'created' });
    await this.eventBus.publish(EventType.MasterDataChanged, 'bank-account', saved.id, { action: 'created' });
    return saved;
  }
  async update(id: string, data: Partial<BankAccount>) {
    const existing = await this.findById(id);
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.MasterDataChanged, 'bank-account', saved.id, { action: 'updated' });
    return saved;
  }
  async softDelete(id: string) {
    const existing = await this.findById(id);
    (existing as any).status = 'inactive';
    return this.repo.save(existing);
  }
}
