import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowDefinition } from '../entities/workflow-definition.entity';
import { WorkflowNode } from '../entities/workflow-node.entity';
import { WorkflowTransition } from '../entities/workflow-transition.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { WorkflowType, NodeType, WorkflowActionType, ExecutionStatus } from '../enums/workflow-definition.enum';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { NotificationService } from '../../notification/notification.service';

export interface CreateWorkflowDto {
  code: string;
  name: string;
  description?: string;
  type?: WorkflowType;
  nodes?: Array<{
    code: string;
    name: string;
    nodeType: NodeType;
    actionType?: WorkflowActionType;
    isStart?: boolean;
    config?: Record<string, unknown>;
  }>;
  transitions?: Array<{
    fromCode: string;
    toCode: string;
    condition?: string;
  }>;
}

@Injectable()
export class WorkflowDefinitionService {
  private readonly logger = new Logger(WorkflowDefinitionService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly definitions: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowNode)
    private readonly nodes: Repository<WorkflowNode>,
    @InjectRepository(WorkflowTransition)
    private readonly transitions: Repository<WorkflowTransition>,
    @InjectRepository(WorkflowExecution)
    private readonly executions: Repository<WorkflowExecution>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
  }

  private getUserId(): string {
    return this.tenantContext.getCurrentUserId() || '';
  }

  private inc(name: string) {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  getPrometheusText(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters.entries()) {
      lines.push(`# TYPE ${k} counter`);
      lines.push(`${k} ${v}`);
    }
    return lines.join('\n') + '\n';
  }

  async create(dto: CreateWorkflowDto): Promise<WorkflowDefinition> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    // Versioning: find max version for this code
    const existing = await this.definitions.find({
      where: { tenantId, code: dto.code },
      order: { version: 'DESC' },
      take: 1,
    });
    const nextVersion = existing.length ? existing[0].version + 1 : 1;

    const def = this.definitions.create({
      tenantId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      type: dto.type ?? WorkflowType.MANUAL,
      version: nextVersion,
      isEnabled: true,
      createdBy: userId || null,
    });
    const saved = await this.definitions.save(def);

    // Nodes
    const nodeMap = new Map<string, WorkflowNode>();
    if (dto.nodes?.length) {
      for (const n of dto.nodes) {
        const node = this.nodes.create({
          tenantId,
          definitionId: saved.id,
          code: n.code,
          name: n.name,
          nodeType: n.nodeType,
          actionType: n.actionType ?? null,
          isStart: n.isStart ?? false,
          config: n.config ?? {},
          createdBy: userId || null,
        });
        const savedNode = await this.nodes.save(node);
        nodeMap.set(n.code, savedNode);
      }
    }

    // Transitions
    if (dto.transitions?.length) {
      for (const t of dto.transitions) {
        const from = nodeMap.get(t.fromCode);
        const to = nodeMap.get(t.toCode);
        if (from && to) {
          const trans = this.transitions.create({
            tenantId,
            definitionId: saved.id,
            fromNodeId: from.id,
            toNodeId: to.id,
            condition: t.condition ?? null,
            createdBy: userId || null,
          });
          await this.transitions.save(trans);
        }
      }
    }

    try {
      await this.audit.logAction('workflow_definition', saved.id, AuditAction.CREATE, {
        newData: { code: saved.code, version: saved.version },
      });
    } catch {}

    this.inc('workflow_definitions_created_total');
    return this.definitions.findOne({
      where: { id: saved.id },
      relations: ['nodes', 'transitions'],
    }) as Promise<WorkflowDefinition>;
  }

  async list(): Promise<WorkflowDefinition[]> {
    const tenantId = this.getTenantId();
    return this.definitions.find({
      where: { tenantId },
      order: { code: 'ASC', version: 'DESC' },
      relations: ['nodes'],
    });
  }

  async get(id: string): Promise<WorkflowDefinition> {
    const tenantId = this.getTenantId();
    const d = await this.definitions.findOne({
      where: { id, tenantId },
      relations: ['nodes', 'transitions'],
    });
    if (!d) throw new NotFoundException('Workflow definition not found');
    return d;
  }

  async setEnabled(id: string, enabled: boolean): Promise<WorkflowDefinition> {
    const d = await this.get(id);
    d.isEnabled = enabled;
    d.updatedBy = this.getUserId() || null;
    return this.definitions.save(d);
  }

  async execute(id: string, input: Record<string, unknown> = {}): Promise<WorkflowExecution> {
    const def = await this.get(id);
    if (!def.isEnabled) throw new BadRequestException('Workflow is disabled');

    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const exec = this.executions.create({
      tenantId,
      definitionId: def.id,
      status: ExecutionStatus.RUNNING,
      startedAt: new Date(),
      input,
      createdBy: userId || null,
    });
    const saved = await this.executions.save(exec);

    try {
      // Simple linear execution for demo: walk from start node
      const startNode = def.nodes?.find((n) => n.isStart) || def.nodes?.[0];
      if (startNode) {
        saved.currentNodeCode = startNode.code;
        await this.executeNode(saved, startNode, def);
      }
      saved.status = ExecutionStatus.COMPLETED;
      saved.completedAt = new Date();
      saved.output = { executed: true, input };
      this.inc('workflow_executions_completed_total');
    } catch (err: any) {
      saved.status = ExecutionStatus.FAILED;
      saved.errorMessage = err.message;
      saved.retryCount += 1;
      this.inc('workflow_executions_failed_total');
      this.logger.warn(`Execution failed: ${err.message}`);
    }

    await this.executions.save(saved);

    try {
      await this.audit.logAction('workflow_execution', saved.id, AuditAction.CREATE, {
        newData: { definitionId: def.id, status: saved.status },
      });
    } catch {}

    return saved;
  }

  private async executeNode(exec: WorkflowExecution, node: WorkflowNode, def: WorkflowDefinition): Promise<void> {
    // Mock action execution
    if (node.actionType === WorkflowActionType.SEND_NOTIFICATION) {
      try {
        await this.notifications.send({
          userId: this.getUserId(),
          title: `Workflow: ${def.name}`,
          body: `Action ${node.code} executed`,
          eventType: 'WorkflowAction',
          data: { executionId: exec.id, node: node.code },
        });
      } catch {}
    }
    // Other actions are no-ops in this foundation; extend later
    this.logger.log(`Executed node ${node.code} (${node.actionType || node.nodeType})`);
  }

  async listExecutions(definitionId?: string): Promise<WorkflowExecution[]> {
    const tenantId = this.getTenantId();
    const where: any = { tenantId };
    if (definitionId) where.definitionId = definitionId;
    return this.executions.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async retry(executionId: string): Promise<WorkflowExecution> {
    const tenantId = this.getTenantId();
    const exec = await this.executions.findOne({ where: { id: executionId, tenantId } });
    if (!exec) throw new NotFoundException('Execution not found');
    if (exec.status !== ExecutionStatus.FAILED) {
      throw new BadRequestException('Only FAILED executions can be retried');
    }
    return this.execute(exec.definitionId, exec.input);
  }
}
