import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from './entities/sales-order.entity';
import { ScopeAwareRepository } from '../../common/repositories/scope-aware.repository';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { ScopeService } from '../scope/scope.service';
import { WorkflowEngineService } from '../workflow/workflow-engine.service';
import { WorkflowStatus } from '../workflow/enums/workflow-status.enum';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';

@Injectable()
export class SalesOrdersService {
  private readonly repo: ScopeAwareRepository<SalesOrder>;

  constructor(
    @InjectRepository(SalesOrder)
    orderRepo: Repository<SalesOrder>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly eventBus: EventBus,
  ) {
    this.repo = new ScopeAwareRepository(
      orderRepo,
      tenantContext,
      scopeService,
      'sales_order',
    );
  }

  async findAll(): Promise<SalesOrder[]> {
    return this.repo.findAll({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<SalesOrder> {
    const order = await this.repo.findById(id);
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }
    return order;
  }

  async create(data: Partial<SalesOrder>): Promise<SalesOrder & { workflowId: string }> {
    const entity = this.repo.create({
      ...this.writable(data),
      status: WorkflowStatus.DRAFT,
      orderDate: data.orderDate ?? new Date().toISOString().slice(0, 10),
    });
    const saved = await this.repo.save(entity);

    // Attach generic workflow instance (Sprint 6)
    const workflow = await this.workflowEngine.createWorkflow('sales_order', saved.id, {
      companyId: saved.companyId,
      branchId: saved.branchId,
      createdBy: saved.createdBy,
    });

    // Publish domain event (Sprint 7)
    await this.eventBus.publish(
      EventType.SalesCreated,
      'sales_order',
      saved.id,
      {
        orderNumber: saved.orderNumber,
        totalAmount: saved.totalAmount,
        customerId: saved.customerId,
        workflowId: workflow.id,
      },
    );

    return { ...saved, workflowId: workflow.id };
  }

  async update(id: string, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const existing = await this.findById(id);
    Object.assign(existing, this.writable(data));
    return this.repo.save(existing);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
    return { id, deleted: true };
  }

  private writable(data: Partial<SalesOrder>): Partial<SalesOrder> {
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
    return rest as Partial<SalesOrder>;
  }
}