import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationWorkflowDefinition } from './entities/automation-workflow-definition.entity';
import { AutomationWorkflowStatus } from './enums/automation-workflow.enum';

@Injectable()
export class AutomationWorkflowSeeder {
  private readonly logger = new Logger(AutomationWorkflowSeeder.name);

  constructor(
    @InjectRepository(AutomationWorkflowDefinition)
    private readonly definitionRepo: Repository<AutomationWorkflowDefinition>,
  ) {}

  async seedForTenant(tenantId: string): Promise<void> {
    const samples = [
      {
        name: 'Invoice Issued - Send Email',
        description: 'Gửi email khi hóa đơn được phát hành',
        triggerEvent: 'InvoiceIssued',
        steps: [
          {
            type: 'SEND_EMAIL',
            config: {
              templateCode: 'invoice_issued',
              to: '{{payload.customerEmail}}',
            },
            onError: 'CONTINUE',
          },
        ],
        status: AutomationWorkflowStatus.ACTIVE,
      },
      {
        name: 'Payment Received - Activate Subscription',
        description: 'Kích hoạt subscription khi nhận thanh toán thành công',
        triggerEvent: 'PaymentReceived',
        steps: [
          {
            type: 'ACTIVATE_SUBSCRIPTION',
            config: {},
            onError: 'STOP',
          },
        ],
        status: AutomationWorkflowStatus.ACTIVE,
      },
      {
        name: 'Subscription Cancelled - Suspend Tenant',
        description: 'Tạm ngưng tenant khi subscription bị hủy',
        triggerEvent: 'SubscriptionCancelled',
        steps: [
          {
            type: 'SUSPEND_TENANT',
            config: {},
            onError: 'STOP',
          },
        ],
        status: AutomationWorkflowStatus.ACTIVE,
      },
    ];

    for (const sample of samples) {
      const existing = await this.definitionRepo.findOne({
        where: { tenantId, name: sample.name },
      });
      if (existing) continue;

      await this.definitionRepo.save(
        this.definitionRepo.create({
          tenantId,
          ...sample,
          createdBy: null,
        }),
      );
    }
    this.logger.log(`Seeded automation workflows for tenant ${tenantId}`);
  }
}
