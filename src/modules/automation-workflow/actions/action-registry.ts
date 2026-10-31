import { Injectable } from '@nestjs/common';
import { AutomationActionType } from '../enums/automation-workflow.enum';

export interface ActionContext {
  tenantId: string;
  instanceId: string;
  payload: Record<string, unknown>;
  stepConfig: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface AutomationAction {
  type: AutomationActionType | string;
  execute(ctx: ActionContext): Promise<ActionResult>;
}

@Injectable()
export class ActionRegistry {
  private readonly actions = new Map<string, AutomationAction>();

  register(action: AutomationAction) {
    this.actions.set(action.type, action);
  }

  get(type: string): AutomationAction | undefined {
    return this.actions.get(type);
  }

  has(type: string): boolean {
    return this.actions.has(type);
  }
}
