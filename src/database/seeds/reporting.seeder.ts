import { DataSource } from 'typeorm';
import { ReportSchedule } from '../../modules/reporting/entities/report-schedule.entity';
import {
  ReportFormat,
  ReportFrequency,
  ReportType,
} from '../../modules/reporting/enums/reporting.enum';

const DEFAULT_SCHEDULES: Array<
  Pick<
    ReportSchedule,
    'name' | 'reportType' | 'format' | 'frequency' | 'deliveryChannels' | 'recipients'
  >
> = [
  {
    name: 'Weekly tenant activity',
    reportType: ReportType.TENANT_ACTIVITY,
    format: ReportFormat.PDF,
    frequency: ReportFrequency.WEEKLY,
    deliveryChannels: ['EMAIL', 'IN_APP'],
    recipients: ['admin@abctrading.vn'],
  },
  {
    name: 'Monthly billing summary',
    reportType: ReportType.BILLING,
    format: ReportFormat.EXCEL,
    frequency: ReportFrequency.MONTHLY,
    deliveryChannels: ['EMAIL'],
    recipients: ['admin@abctrading.vn'],
  },
];

function nextRun(frequency: ReportFrequency, from = new Date()): Date {
  const next = new Date(from);
  if (frequency === ReportFrequency.DAILY) next.setDate(next.getDate() + 1);
  else if (frequency === ReportFrequency.WEEKLY) next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * C7: default report schedules for the demo tenants. Idempotent by
 * (tenant_id, name); recipients point at the tenant admin mailbox.
 */
export async function seedReportSchedules(dataSource: DataSource): Promise<void> {
  const tenants: Array<{ id: string; code: string }> = await dataSource.query(
    "SELECT id, code FROM tenants WHERE code IN ('ABC', 'CAFE_MOC')",
  );
  const repo = dataSource.getRepository(ReportSchedule);
  let created = 0;

  for (const tenant of tenants) {
    const adminEmail =
      tenant.code === 'ABC' ? 'admin@abctrading.vn' : 'owner@cafemoc.vn';
    for (const template of DEFAULT_SCHEDULES) {
      const existing = await repo.findOne({
        where: { tenantId: tenant.id, name: template.name },
      });
      if (existing) {
        if (!existing.enabled) {
          existing.enabled = true;
          await repo.save(existing);
        }
        continue;
      }
      await repo.save(
        repo.create({
          tenantId: tenant.id,
          ...template,
          recipients: [adminEmail],
          webhookIds: [],
          params: {},
          enabled: true,
          nextRunAt: nextRun(template.frequency),
        }),
      );
      created += 1;
    }
  }

  console.log(
    `✅ Reporting seeder completed (tenants: ${tenants.length}, new schedules: ${created})`,
  );
}
