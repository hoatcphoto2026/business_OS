import { DataSource } from 'typeorm';
import { NotificationTemplate } from './entities/notification-template.entity';

export async function seedNotificationTemplates(dataSource: DataSource, tenantId: string) {
  const repo = dataSource.getRepository(NotificationTemplate);
  const defs = [
    // Existing
    { code: 'workflow.submitted', channel: 'in_app', subject: 'Workflow submitted', body: 'A workflow has been submitted for approval.', variables: ['aggregateId'] },
    { code: 'workflow.approved', channel: 'in_app', subject: 'Workflow approved', body: 'Your workflow has been approved.', variables: ['aggregateId'] },
    { code: 'sales.created', channel: 'in_app', subject: 'New sales order', body: 'A new sales order {{orderNumber}} has been created.', variables: ['orderNumber'] },
    { code: 'customer.created', channel: 'in_app', subject: 'New customer', body: 'Customer {{name}} has been created.', variables: ['name'] },
    // A2 – Billing / Lifecycle
    { code: 'PLAN_CHANGED', channel: 'in_app', subject: 'Plan changed', body: 'Your plan has been changed for tenant {{tenant}}.', variables: ['tenant'] },
    { code: 'INVOICE_CREATED', channel: 'in_app', subject: 'Invoice created', body: 'Invoice {{invoiceNumber}} for {{amount}} has been created.', variables: ['invoiceNumber', 'amount', 'tenant'] },
    { code: 'PAYMENT_RECEIVED', channel: 'in_app', subject: 'Payment received', body: 'Payment of {{amount}} received for invoice {{invoiceNumber}}.', variables: ['amount', 'invoiceNumber', 'tenant'] },
    { code: 'SUBSCRIPTION_EXPIRING', channel: 'in_app', subject: 'Subscription expiring', body: 'Your subscription for {{tenant}} is expiring soon.', variables: ['tenant'] },
    { code: 'SUBSCRIPTION_EXPIRED', channel: 'in_app', subject: 'Subscription expired', body: 'Your subscription for {{tenant}} has expired.', variables: ['tenant'] },
  ];
  let created = 0;
  for (const d of defs) {
    const exists = await repo.findOne({ where: { code: d.code, tenantId } });
    if (!exists) {
      await repo.save(repo.create({ ...d, tenantId, active: true }));
      created++;
    }
  }
  return { templates: created };
}
