import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationWorkflowInstance } from './entities/automation-workflow-instance.entity';
import { AutomationWorkflowExecution } from './entities/automation-workflow-execution.entity';
import { AutomationWorkflowDefinition } from './entities/automation-workflow-definition.entity';
import {
  AutomationInstanceStatus,
  AutomationExecutionStatus,
  OnErrorPolicy,
} from './enums/automation-workflow.enum';
import { ActionRegistry, ActionContext } from './actions/action-registry';

@Injectable()
export class WorkflowExecutionService {
  private readonly logger = new Logger(WorkflowExecutionService.name);

  constructor(
    @InjectRepository(AutomationWorkflowInstance)
    private readonly instanceRepo: Repository<AutomationWorkflowInstance>,
    @InjectRepository(AutomationWorkflowExecution)
    private readonly executionRepo: Repository<AutomationWorkflowExecution>,
    @InjectRepository(AutomationWorkflowDefinition)
    private readonly definitionRepo: Repository<AutomationWorkflowDefinition>,
    private readonly actionRegistry: ActionRegistry,
  ) {}

  async executeInstance(instanceId: string): Promise<void> {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId },
      relations: ['definition'],
    });

    if (!instance || !instance.definition) {
      this.logger.warn(`Instance ${instanceId} not found or missing definition`);
      return;
    }

    if (instance.status === AutomationInstanceStatus.COMPLETED) {
      return;
    }

    instance.status = AutomationInstanceStatus.RUNNING;
    instance.startedAt = instance.startedAt || new Date();
    await this.instanceRepo.save(instance);

    const steps = instance.definition.steps || [];
    let failed = false;

    for (let i = instance.currentStepIndex; i < steps.length; i++) {
      const step = steps[i];
      const start = Date.now();

      const exec = this.executionRepo.create({
        instanceId: instance.id,
        stepIndex: i,
        stepType: step.type,
        stepConfig: step.config,
        status: AutomationExecutionStatus.PENDING,
        input: instance.context,
      });
      await this.executionRepo.save(exec);

      const action = this.actionRegistry.get(step.type);
      if (!action) {
        exec.status = AutomationExecutionStatus.FAILED;
        exec.error = `Unknown action type: ${step.type}`;
        exec.executedAt = new Date();
        exec.durationMs = Date.now() - start;
        await this.executionRepo.save(exec);
        failed = true;
        if ((step.onError || OnErrorPolicy.STOP) === OnErrorPolicy.STOP) {
          break;
        }
        continue;
      }

      const ctx: ActionContext = {
        tenantId: instance.tenantId,
        instanceId: instance.id,
        payload: (instance.context as any) || {},
        stepConfig: step.config || {},
      };

      const result = await action.execute(ctx);
      exec.executedAt = new Date();
      exec.durationMs = Date.now() - start;
      exec.output = result.output || null;

      if (result.success) {
        exec.status = AutomationExecutionStatus.SUCCESS;
      } else {
        exec.status = AutomationExecutionStatus.FAILED;
        exec.error = result.error || 'Action failed';
        failed = true;
      }
      await this.executionRepo.save(exec);

      instance.currentStepIndex = i + 1;
      await this.instanceRepo.save(instance);

      if (!result.success && (step.onError || OnErrorPolicy.STOP) === OnErrorPolicy.STOP) {
        break;
      }
    }

    instance.status = failed
      ? AutomationInstanceStatus.FAILED
      : AutomationInstanceStatus.COMPLETED;
    instance.completedAt = new Date();
    if (failed) {
      instance.errorMessage = 'One or more steps failed';
    }
    await this.instanceRepo.save(instance);

    this.logger.log(
      `Instance ${instanceId} finished with status ${instance.status}`,
    );
  }
}
