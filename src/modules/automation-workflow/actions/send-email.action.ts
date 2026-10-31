import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../../notification/notification.service';
import { AutomationAction, ActionContext, ActionResult } from './action-registry';
import { AutomationActionType } from '../enums/automation-workflow.enum';

@Injectable()
export class SendEmailAction implements AutomationAction {
  readonly type = AutomationActionType.SEND_EMAIL;
  private readonly logger = new Logger(SendEmailAction.name);

  constructor(private readonly notificationService: NotificationService) {}

  async execute(ctx: ActionContext): Promise<ActionResult> {
    try {
      const templateCode = (ctx.stepConfig.templateCode as string) || 'default';
      const to = this.interpolate(ctx.stepConfig.to as string, ctx.payload);
      const variables = this.buildVariables(ctx.payload);

      await this.notificationService.send({
        templateCode,
        title: `Automation: ${templateCode}`,
        body: `Triggered by automation for ${to || 'recipient'}`,
        channels: ['EMAIL' as any],
        variables,
        eventType: ctx.payload.eventType as string,
        data: { to, ...ctx.payload },
      });

      this.logger.log(`SEND_EMAIL executed for instance ${ctx.instanceId}`);
      return { success: true, output: { templateCode, to } };
    } catch (err: any) {
      this.logger.error(`SEND_EMAIL failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private interpolate(template: string | undefined, payload: Record<string, unknown>): string {
    if (!template) return '';
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const keys = path.trim().split('.');
      let val: any = payload;
      for (const k of keys) {
        val = val?.[k];
      }
      return val != null ? String(val) : '';
    });
  }

  private buildVariables(payload: Record<string, unknown>): Record<string, string | number> {
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === 'string' || typeof v === 'number') {
        vars[k] = v;
      }
    }
    return vars;
  }
}
