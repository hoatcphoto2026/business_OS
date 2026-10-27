import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTerm } from '../entities/payment-term.entity';
import { ScopeAwareRepository } from '../../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../../scope/scope.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class PaymentTermService {
  private readonly logger = new Logger(PaymentTermService.name);
  private readonly repo: ScopeAwareRepository<PaymentTerm>;

  constructor(
    @InjectRepository(PaymentTerm) repo: Repository<PaymentTerm>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(repo, tenantContext, scopeService, 'payment-term');
  }

  async findAll() { return this.repo.findAll({ order: { createdAt: 'DESC' } as any }); }
  async findById(id: string) {
    const e = await this.repo.findById(id);
    if (!e) throw new NotFoundException('PaymentTerm not found');
    return e;
  }
  async create(data: Partial<PaymentTerm>) {
    const saved = await this.repo.save(this.repo.create(data as any));
    const et = (EventType as any)['PaymentTermCreated'] || EventType.MasterDataChanged;
    await this.eventBus.publish(et, 'payment-term', saved.id, { action: 'created' });
    await this.eventBus.publish(EventType.MasterDataChanged, 'payment-term', saved.id, { action: 'created' });
    return saved;
  }
  async update(id: string, data: Partial<PaymentTerm>) {
    const existing = await this.findById(id);
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.MasterDataChanged, 'payment-term', saved.id, { action: 'updated' });
    return saved;
  }
  async softDelete(id: string) {
    const existing = await this.findById(id);
    (existing as any).status = 'inactive';
    return this.repo.save(existing);
  }
}
