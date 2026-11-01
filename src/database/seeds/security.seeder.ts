import { DataSource } from 'typeorm';
import { AlertRule } from '../../modules/security/entities/alert-rule.entity';
import {
  SecurityEventType,
  SecuritySeverity,
} from '../../modules/security/enums/security.enum';

const DEFAULT_RULES: Array<Pick<
  AlertRule,
  'name' | 'eventType' | 'threshold' | 'windowMinutes' | 'severity' | 'channels'
>> = [
  {
    name: 'Repeated failed logins',
    eventType: SecurityEventType.FAILED_LOGIN,
    threshold: 5,
    windowMinutes: 15,
    severity: SecuritySeverity.HIGH,
    channels: ['email'],
  },
  {
    name: 'Suspicious activity',
    eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
    threshold: 1,
    windowMinutes: 30,
    severity: SecuritySeverity.HIGH,
    channels: ['email'],
  },
  {
    name: 'Geo anomaly',
    eventType: SecurityEventType.GEO_ANOMALY,
    threshold: 1,
    windowMinutes: 60,
    severity: SecuritySeverity.HIGH,
    channels: ['email', 'slack'],
  },
  {
    name: 'Secret rotation burst',
    eventType: SecurityEventType.SECRET_ROTATED,
    threshold: 3,
    windowMinutes: 60,
    severity: SecuritySeverity.MEDIUM,
    channels: ['email'],
  },
  {
    name: 'Emergency access requested',
    eventType: SecurityEventType.EMERGENCY_ACCESS_REQUESTED,
    threshold: 1,
    windowMinutes: 30,
    severity: SecuritySeverity.CRITICAL,
    channels: ['email'],
  },
];

/**
 * C6: default alert rules for the demo tenants. Idempotent by (tenant, name)
 * and re-enables rules a test may have disabled.
 */
export async function seedSecurityAlertRules(dataSource: DataSource): Promise<void> {
  const tenants: Array<{ id: string; code: string }> = await dataSource.query(
    "SELECT id, code FROM tenants WHERE code IN ('ABC', 'CAFE_MOC')",
  );
  const repo = dataSource.getRepository(AlertRule);
  let created = 0;
  let repaired = 0;

  for (const tenant of tenants) {
    for (const rule of DEFAULT_RULES) {
      const existing = await repo.findOne({
        where: { tenantId: tenant.id, name: rule.name },
      });
      if (existing) {
        if (!existing.enabled) {
          existing.enabled = true;
          await repo.save(existing);
          repaired += 1;
        }
        continue;
      }
      await repo.save(
        repo.create({
          tenantId: tenant.id,
          ...rule,
          enabled: true,
        }),
      );
      created += 1;
    }
  }

  console.log(
    `✅ Security seeder completed (tenants: ${tenants.length}, new rules: ${created}, re-enabled: ${repaired})`,
  );
}
