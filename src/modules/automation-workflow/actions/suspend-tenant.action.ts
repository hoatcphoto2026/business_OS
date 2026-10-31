import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantStatus } from '../../tenant/entities/tenant.entity';
import { AutomationAction, ActionContext, ActionResult } from './action-registry';
import { AutomationActionType } from '../enums/automation-workflow.enum';

@Injectable()
export class SuspendTenantAction implements AutomationAction {
  readonly type = AutomationActionType.SUSPEND_TENANT;
  private readonly logger = new Logger(SuspendTenantAction.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async execute(ctx: ActionContext): Promise<ActionResult> {
    try {
      const tenant = await this.tenantRepo.findOne({ where: { id: ctx.tenantId } });
      if (!tenant) {
        return { success: false, error: 'Tenant not found' };
      }

      if (tenant.status === TenantStatus.SUSPENDED) {
        return { success: true, output: { alreadySuspended: true } };
      }

      tenant.status = TenantStatus.SUSPENDED;
      await this.tenantRepo.save(tenant);

      this.logger.log(`Tenant ${ctx.tenantId} suspended`);
      return { success: true, output: { tenantId: ctx.tenantId, status: tenant.status } };
    } catch (err: any) {
      this.logger.error(`SUSPEND_TENANT failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
