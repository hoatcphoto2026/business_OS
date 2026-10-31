import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationWorkflowDefinition } from './entities/automation-workflow-definition.entity';
import { AutomationWorkflowInstance } from './entities/automation-workflow-instance.entity';
import { AutomationWorkflowExecution } from './entities/automation-workflow-execution.entity';
import { CreateDefinitionDto, UpdateDefinitionDto } from './dto/automation-workflow.dto';
import { AutomationWorkflowStatus, AutomationInstanceStatus } from './enums/automation-workflow.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { WorkflowExecutionService } from './workflow-execution.service';

@Injectable()
export class AutomationWorkflowService {
  private readonly logger = new Logger(AutomationWorkflowService.name);

  constructor(
    @InjectRepository(AutomationWorkflowDefinition)
    private readonly definitionRepo: Repository<AutomationWorkflowDefinition>,
    @InjectRepository(AutomationWorkflowInstance)
    private readonly instanceRepo: Repository<AutomationWorkflowInstance>,
    @InjectRepository(AutomationWorkflowExecution)
    private readonly executionRepo: Repository<AutomationWorkflowExecution>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly executionService: WorkflowExecutionService,
  ) {}

  private getTenantId(): string {
    const ctx = this.tenantContext.getContext();
    if (!ctx?.tenantId) {
      throw new BadRequestException('Tenant context required');
    }
    return ctx.tenantId;
  }

  async createDefinition(dto: CreateDefinitionDto): Promise<AutomationWorkflowDefinition> {
    const tenantId = this.getTenantId();
    const def = this.definitionRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description || null,
      triggerEvent: dto.triggerEvent,
      conditions: dto.conditions || null,
      steps: dto.steps,
      status: dto.status || AutomationWorkflowStatus.DRAFT,
      createdBy: this.tenantContext.tryGetUserId() || null,
    });
    const saved = await this.definitionRepo.save(def);

    await this.audit.logAction(
      'automation_workflow_definition',
      saved.id,
      AuditAction.CREATE,
      { newData: { name: saved.name, triggerEvent: saved.triggerEvent } },
    );

    return saved;
  }

  async updateDefinition(id: string, dto: UpdateDefinitionDto): Promise<AutomationWorkflowDefinition> {
    const tenantId = this.getTenantId();
    const def = await this.definitionRepo.findOne({ where: { id, tenantId } });
    if (!def) throw new NotFoundException('Definition not found');

    Object.assign(def, {
      name: dto.name ?? def.name,
      description: dto.description ?? def.description,
      triggerEvent: dto.triggerEvent ?? def.triggerEvent,
      conditions: dto.conditions ?? def.conditions,
      steps: dto.steps ?? def.steps,
      status: dto.status ?? def.status,
    });

    const saved = await this.definitionRepo.save(def);
    await this.audit.logAction(
      'automation_workflow_definition',
      saved.id,
      AuditAction.UPDATE,
      { newData: { name: saved.name, status: saved.status } },
    );
    return saved;
  }

  async listDefinitions(): Promise<AutomationWorkflowDefinition[]> {
    const tenantId = this.getTenantId();
    return this.definitionRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getDefinition(id: string): Promise<AutomationWorkflowDefinition> {
    const tenantId = this.getTenantId();
    const def = await this.definitionRepo.findOne({ where: { id, tenantId } });
    if (!def) throw new NotFoundException('Definition not found');
    return def;
  }

  async deleteDefinition(id: string): Promise<void> {
    const tenantId = this.getTenantId();
    const def = await this.definitionRepo.findOne({ where: { id, tenantId } });
    if (!def) throw new NotFoundException('Definition not found');

    const running = await this.instanceRepo.count({
      where: { definitionId: id, status: AutomationInstanceStatus.RUNNING },
    });
    if (running > 0) {
      throw new BadRequestException('Cannot delete definition with running instances');
    }

    await this.definitionRepo.remove(def);
    await this.audit.logAction(
      'automation_workflow_definition',
      id,
      AuditAction.DELETE,
    );
  }

  async activate(id: string): Promise<AutomationWorkflowDefinition> {
    return this.updateDefinition(id, { status: AutomationWorkflowStatus.ACTIVE });
  }

  async deactivate(id: string): Promise<AutomationWorkflowDefinition> {
    return this.updateDefinition(id, { status: AutomationWorkflowStatus.INACTIVE });
  }

  async listInstances(): Promise<AutomationWorkflowInstance[]> {
    const tenantId = this.getTenantId();
    return this.instanceRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getInstance(id: string): Promise<AutomationWorkflowInstance> {
    const tenantId = this.getTenantId();
    const inst = await this.instanceRepo.findOne({ where: { id, tenantId } });
    if (!inst) throw new NotFoundException('Instance not found');
    return inst;
  }

  async getExecutions(instanceId: string): Promise<AutomationWorkflowExecution[]> {
    const tenantId = this.getTenantId();
    const inst = await this.instanceRepo.findOne({ where: { id: instanceId, tenantId } });
    if (!inst) throw new NotFoundException('Instance not found');
    return this.executionRepo.find({
      where: { instanceId },
      order: { stepIndex: 'ASC' },
    });
  }

  async retryInstance(id: string): Promise<AutomationWorkflowInstance> {
    const inst = await this.getInstance(id);
    if (inst.status !== AutomationInstanceStatus.FAILED) {
      throw new BadRequestException('Only FAILED instances can be retried');
    }
    inst.status = AutomationInstanceStatus.PENDING;
    inst.currentStepIndex = 0;
    inst.errorMessage = null;
    inst.completedAt = null;
    await this.instanceRepo.save(inst);
    await this.executionService.executeInstance(inst.id);
    return this.getInstance(id);
  }

  /**
   * Called by subscriber when matching event arrives.
   */
  async triggerFromEvent(
    tenantId: string,
    eventType: string,
    aggregateType: string | null,
    aggregateId: string | null,
    payload: Record<string, unknown>,
  ): Promise<AutomationWorkflowInstance[]> {
    const defs = await this.definitionRepo.find({
      where: {
        tenantId,
        triggerEvent: eventType,
        status: AutomationWorkflowStatus.ACTIVE,
      },
    });

    const instances: AutomationWorkflowInstance[] = [];
    for (const def of defs) {
      const inst = this.instanceRepo.create({
        tenantId,
        definitionId: def.id,
        triggerEvent: eventType,
        aggregateType,
        aggregateId,
        status: AutomationInstanceStatus.PENDING,
        context: { ...payload, eventType },
      });
      const saved = await this.instanceRepo.save(inst);
      instances.push(saved);

      // Fire-and-forget execution
      this.executionService.executeInstance(saved.id).catch((err) => {
        this.logger.error(`Execution failed for instance ${saved.id}: ${err.message}`);
      });
    }
    return instances;
  }
}
