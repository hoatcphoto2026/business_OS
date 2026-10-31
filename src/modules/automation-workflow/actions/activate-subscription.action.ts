import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../billing/entities/subscription.entity';
import { SubscriptionStatus } from '../../billing/enums/billing.enum';
import { AutomationAction, ActionContext, ActionResult } from './action-registry';
import { AutomationActionType } from '../enums/automation-workflow.enum';

@Injectable()
export class ActivateSubscriptionAction implements AutomationAction {
  readonly type = AutomationActionType.ACTIVATE_SUBSCRIPTION;
  private readonly logger = new Logger(ActivateSubscriptionAction.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  async execute(ctx: ActionContext): Promise<ActionResult> {
    try {
      const sub = await this.subscriptionRepo.findOne({
        where: { tenantId: ctx.tenantId },
        order: { createdAt: 'DESC' },
      });

      if (!sub) {
        return { success: false, error: 'No subscription found for tenant' };
      }

      if (sub.status === SubscriptionStatus.ACTIVE) {
        return { success: true, output: { alreadyActive: true, subscriptionId: sub.id } };
      }

      sub.status = SubscriptionStatus.ACTIVE;
      await this.subscriptionRepo.save(sub);

      this.logger.log(`Subscription ${sub.id} activated for tenant ${ctx.tenantId}`);
      return { success: true, output: { subscriptionId: sub.id, status: sub.status } };
    } catch (err: any) {
      this.logger.error(`ACTIVATE_SUBSCRIPTION failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
