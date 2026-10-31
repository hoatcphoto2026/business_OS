import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleDefinition } from './entities/rule-definition.entity';
import { RuleCondition } from './entities/rule-condition.entity';
import { RuleAction } from './entities/rule-action.entity';
import { RuleExecution } from './entities/rule-execution.entity';
import { RuleOperator, RuleExecutionStatus, ConditionType } from './enums/rule.enum';
import { CreateRuleDto, EvaluateRuleDto } from './dto/rule.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { NotificationService } from '../notification/notification.service';
import { SupportService } from '../support/support.service';
import { AutoSuspensionService } from '../auto-suspension/auto-suspension.service';

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(RuleDefinition)
    private readonly rules: Repository<RuleDefinition>,
    @InjectRepository(RuleCondition)
    private readonly conditions: Repository<RuleCondition>,
    @InjectRepository(RuleAction)
    private readonly actions: Repository<RuleAction>,
    @InjectRepository(RuleExecution)
    private readonly executions: Repository<RuleExecution>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly support: SupportService,
    private readonly suspension: AutoSuspensionService,
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

  async create(dto: CreateRuleDto): Promise<RuleDefinition> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const existing = await this.rules.find({
      where: { tenantId, code: dto.code },
      order: { version: 'DESC' },
      take: 1,
    });
    const nextVersion = existing.length ? existing[0].version + 1 : 1;

    const rule = this.rules.create({
      tenantId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      version: nextVersion,
      isEnabled: dto.isEnabled ?? true,
      createdBy: userId || null,
    });
    const saved = await this.rules.save(rule);

    if (dto.conditions?.length) {
      for (const c of dto.conditions) {
        const cond = this.conditions.create({
          tenantId,
          ruleId: saved.id,
          conditionType: c.conditionType,
          operator: c.operator,
          value: c.value,
          sortOrder: c.sortOrder ?? 0,
          createdBy: userId || null,
        });
        await this.conditions.save(cond);
      }
    }

    if (dto.actions?.length) {
      for (const a of dto.actions) {
        const act = this.actions.create({
          tenantId,
          ruleId: saved.id,
          actionType: a.actionType,
          config: a.config ?? {},
          sortOrder: a.sortOrder ?? 0,
          createdBy: userId || null,
        });
        await this.actions.save(act);
      }
    }

    try {
      await this.audit.logAction('rule_definition', saved.id, AuditAction.CREATE, {
        newData: { code: saved.code, version: saved.version },
      });
    } catch {
      this.logger.warn('Audit skipped on rule create');
    }

    this.inc('rules_created_total');
    return this.rules.findOne({
      where: { id: saved.id },
      relations: ['conditions', 'actions'],
    }) as Promise<RuleDefinition>;
  }

  async list(): Promise<RuleDefinition[]> {
    const tenantId = this.getTenantId();
    return this.rules.find({
      where: { tenantId },
      order: { code: 'ASC', version: 'DESC' },
      relations: ['conditions', 'actions'],
    });
  }

  async get(id: string): Promise<RuleDefinition> {
    const tenantId = this.getTenantId();
    const r = await this.rules.findOne({
      where: { id, tenantId },
      relations: ['conditions', 'actions'],
    });
    if (!r) throw new NotFoundException('Rule not found');
    return r;
  }

  async setEnabled(id: string, enabled: boolean): Promise<RuleDefinition> {
    const r = await this.get(id);
    r.isEnabled = enabled;
    r.updatedBy = this.getUserId() || null;
    return this.rules.save(r);
  }

  async evaluate(dto: EvaluateRuleDto): Promise<RuleExecution[]> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const where: any = { tenantId, isEnabled: true };
    if (dto.ruleCode) where.code = dto.ruleCode;

    const rules = await this.rules.find({
      where,
      relations: ['conditions', 'actions'],
    });

    const results: RuleExecution[] = [];

    for (const rule of rules) {
      const exec = this.executions.create({
        tenantId,
        ruleId: rule.id,
        input: dto.input,
        evaluatedAt: new Date(),
        createdBy: userId || null,
      });

      try {
        const matched = this.evaluateConditions(rule.conditions || [], dto.input);
        exec.status = matched ? RuleExecutionStatus.MATCHED : RuleExecutionStatus.NOT_MATCHED;

        if (matched) {
          const actionResults = await this.executeActions(rule.actions || [], dto.input);
          exec.result = { matched: true, actions: actionResults };
          this.inc('rules_matched_total');
        } else {
          exec.result = { matched: false };
          this.inc('rules_not_matched_total');
        }
      } catch (err: any) {
        exec.status = RuleExecutionStatus.ERROR;
        exec.errorMessage = err.message;
        this.inc('rules_error_total');
      }

      const saved = await this.executions.save(exec);
      results.push(saved);

      try {
        await this.audit.logAction('rule_execution', saved.id, AuditAction.CREATE, {
          newData: { ruleId: rule.id, status: saved.status },
        });
      } catch {}
    }

    return results;
  }

  private evaluateConditions(conditions: RuleCondition[], input: Record<string, unknown>): boolean {
    if (!conditions.length) return true;

    for (const c of conditions) {
      const actual = this.resolveValue(c.conditionType, input);
      if (!this.compare(actual, c.operator, c.value)) {
        return false;
      }
    }
    return true;
  }

  private resolveValue(type: ConditionType, input: Record<string, unknown>): unknown {
    switch (type) {
      case ConditionType.USAGE_THRESHOLD:
        return input.usagePercent ?? input.usage ?? 0;
      case ConditionType.SUBSCRIPTION_STATUS:
        return input.subscriptionStatus ?? input.status;
      case ConditionType.PAYMENT_STATUS:
        return input.paymentStatus;
      case ConditionType.INVOICE_STATUS:
        return input.invoiceStatus;
      default:
        return undefined;
    }
  }

  private compare(actual: unknown, operator: RuleOperator, expected: string): boolean {
    const aNum = Number(actual);
    const eNum = Number(expected);
    const bothNumeric = !isNaN(aNum) && !isNaN(eNum);

    switch (operator) {
      case RuleOperator.EQ:
        return bothNumeric ? aNum === eNum : String(actual) === expected;
      case RuleOperator.NEQ:
        return bothNumeric ? aNum !== eNum : String(actual) !== expected;
      case RuleOperator.GT:
        return bothNumeric && aNum > eNum;
      case RuleOperator.LT:
        return bothNumeric && aNum < eNum;
      case RuleOperator.GTE:
        return bothNumeric && aNum >= eNum;
      case RuleOperator.LTE:
        return bothNumeric && aNum <= eNum;
      default:
        return false;
    }
  }

  private async executeActions(actions: RuleAction[], input: Record<string, unknown>): Promise<any[]> {
    const results: any[] = [];
    for (const a of actions) {
      try {
        if (a.actionType === 'SEND_NOTIFICATION') {
          await this.notifications.send({
            userId: this.getUserId(),
            title: 'Rule triggered',
            body: `Condition matched. Input: ${JSON.stringify(input)}`,
            eventType: 'RuleMatched',
            data: { action: a.actionType },
          });
          results.push({ action: a.actionType, ok: true });
        } else if (a.actionType === 'CREATE_TICKET') {
          const ticket = await this.support.create({
            subject: `Rule action: ${a.actionType}`,
            description: `Triggered by rule. Input: ${JSON.stringify(input)}`,
            priority: 'MEDIUM',
          } as any);
          results.push({ action: a.actionType, ok: true, ticketId: ticket?.id });
        } else if (a.actionType === 'SUSPEND_TENANT') {
          const rec = await this.suspension.trigger({
            trigger: 'USAGE_ABUSE' as any,
            reason: `Rule triggered. Input: ${JSON.stringify(input)}`,
          });
          results.push({ action: a.actionType, ok: true, recordId: rec?.id, status: rec?.status });
        } else if (a.actionType === 'REACTIVATE_TENANT') {
          const res = await this.suspension.reactivate(`Rule triggered. Input: ${JSON.stringify(input)}`);
          results.push({ action: a.actionType, ok: res.ok, tenantId: res.tenantId });
        } else {
          results.push({ action: a.actionType, ok: true, note: 'logged' });
        }
      } catch (err: any) {
        results.push({ action: a.actionType, ok: false, error: err.message });
      }
    }
    return results;
  }

  async listHistory(ruleId?: string): Promise<RuleExecution[]> {
    const tenantId = this.getTenantId();
    const where: any = { tenantId };
    if (ruleId) where.ruleId = ruleId;
    return this.executions.find({
      where,
      order: { evaluatedAt: 'DESC' },
      take: 100,
    });
  }
}
