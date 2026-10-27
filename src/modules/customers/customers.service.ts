import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { ScopeAwareRepository } from '../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../scope/scope.service';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);
  private readonly repo: ScopeAwareRepository<Customer>;

  constructor(
    @InjectRepository(Customer)
    customerRepo: Repository<Customer>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(
      customerRepo,
      tenantContext,
      scopeService,
      'customer',
    );
  }

  async findAll(): Promise<Customer[]> {
    try {
      return await this.repo.findAll({
        order: { createdAt: 'DESC' },
      });
    } catch (err: any) {
      this.logger.error(`findAll failed: ${err.message}`, err.stack);
      throw new InternalServerErrorException(`Customer query failed: ${err.message}`);
    }
  }

  async findById(id: string): Promise<Customer> {
    try {
      const customer = await this.repo.findById(id);
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      return customer;
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`findById(${id}) failed: ${err.message}`, err.stack);
      throw new InternalServerErrorException(`Customer query failed: ${err.message}`);
    }
  }

  async create(data: Partial<Customer>): Promise<Customer> {
    const entity = this.repo.create(this.writable(data));
    const saved = await this.repo.save(entity);

    await this.eventBus.publish(
      EventType.CustomerCreated,
      'customer',
      saved.id,
      { name: saved.name, code: (saved as any).code ?? null },
    );
    await this.eventBus.publish(EventType.MasterDataChanged, 'customer', saved.id, { action: 'created' });

    return saved;
  }

  async update(id: string, data: Partial<Customer>): Promise<Customer> {
    const existing = await this.findById(id);
    Object.assign(existing, this.writable(data));
    const saved = await this.repo.save(existing);

    await this.eventBus.publish(
      EventType.CustomerUpdated,
      'customer',
      saved.id,
      { name: saved.name },
    );
    await this.eventBus.publish(EventType.MasterDataChanged, 'customer', saved.id, { action: 'updated' });

    return saved;
  }

  async softDelete(id: string): Promise<Customer> {
    const existing = await this.findById(id);
    existing.status = 'inactive';
    const saved = await this.repo.save(existing);
    await this.eventBus.publish(EventType.CustomerDeleted, 'customer', saved.id, {});
    await this.eventBus.publish(EventType.MasterDataChanged, 'customer', saved.id, { action: 'deleted' });
    return saved;
  }

  /** Alias for controller compatibility */
  async remove(id: string): Promise<Customer> {
    return this.softDelete(id);
  }

  private writable(data: Partial<Customer>): Partial<Customer> {
    const source = data as Record<string, unknown>;
    const {
      id: _id,
      tenantId: _tenantId,
      ownerId: _ownerId,
      companyId: _companyId,
      branchId: _branchId,
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...rest
    } = source;
    return rest as Partial<Customer>;
  }
}
