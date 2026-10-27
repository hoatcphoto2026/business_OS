import { DataSource } from 'typeorm';
import { NotificationTemplate } from './entities/notification-template.entity';

export async function seedNotificationTemplates(dataSource: DataSource, tenantId: string) {
  const repo = dataSource.getRepository(NotificationTemplate);
  const defs = [
    { code: 'workflow.submitted', channel: 'in_app', subject: 'Workflow submitted', body: 'A workflow has been submitted for approval.', variables: ['aggregateId'] },
    { code: 'workflow.approved', channel: 'in_app', subject: 'Workflow approved', body: 'Your workflow has been approved.', variables: ['aggregateId'] },
    { code: 'sales.created', channel: 'in_app', subject: 'New sales order', body: 'A new sales order {{orderNumber}} has been created.', variables: ['orderNumber'] },
    { code: 'customer.created', channel: 'in_app', subject: 'New customer', body: 'Customer {{name}} has been created.', variables: ['name'] },
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
