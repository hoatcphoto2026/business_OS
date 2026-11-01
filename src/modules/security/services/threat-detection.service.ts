import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DetectQueryDto } from '../dto/security.dto';
import {
  SecurityEventSource,
  SecurityEventType,
  SecuritySeverity,
} from '../enums/security.enum';
import { SecurityEventsService } from './security-events.service';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { MetricsService } from '../../../common/metrics/metrics.service';

interface FailedLoginRow {
  email: string;
  failures: number;
  lastIp: string | null;
  country: string | null;
}

interface SuspiciousIpRow {
  userId: string;
  email: string;
  logins: number;
  ips: number;
  countries: string[] | null;
}

export interface DetectionResult {
  type: string;
  detected: number;
  findings: Array<Record<string, unknown>>;
  eventIds: string[];
}

@Injectable()
export class ThreatDetectionService {
  private readonly logger = new Logger(ThreatDetectionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly events: SecurityEventsService,
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
  ) {}

  private tenantId(): string {
    return this.tenantContext.getCurrentTenantId();
  }

  private bucket(windowMinutes: number): number {
    return Math.floor(Date.now() / (windowMinutes * 60_000));
  }

  /** Brute-force / credential-guessing detection per email. */
  async detectFailedLogins(query: DetectQueryDto): Promise<DetectionResult> {
    const windowMinutes = query.windowMinutes ?? 15;
    const threshold = query.threshold ?? 5;
    const rows: FailedLoginRow[] = await this.dataSource.query(
      `SELECT email,
              COUNT(*)::int AS failures,
              MAX(ip_address) AS "lastIp",
              MAX(country) AS country
         FROM security_login_attempts
        WHERE tenant_id = $1
          AND success = false
          AND created_at > now() - ($2 * interval '1 minute')
        GROUP BY email
       HAVING COUNT(*) >= $3
        ORDER BY failures DESC`,
      [this.tenantId(), windowMinutes, threshold],
    );

    const eventIds: string[] = [];
    for (const row of rows) {
      const severity =
        row.failures >= threshold * 2
          ? SecuritySeverity.CRITICAL
          : SecuritySeverity.HIGH;
      const event = await this.events.create({
        tenantId: this.tenantId(),
        eventType: SecurityEventType.FAILED_LOGIN,
        severity,
        source: SecurityEventSource.AUTH,
        actorEmail: row.email,
        ipAddress: row.lastIp,
        country: row.country,
        riskScore: Math.min(100, row.failures * 10),
        dedupeKey: `failed-login:${row.email}:${windowMinutes}m:${this.bucket(windowMinutes)}`,
        metadata: { failures: row.failures, windowMinutes, threshold },
      });
      eventIds.push(event.id);
    }

    this.metrics.inc('security_detections_total', { type: 'FAILED_LOGIN' });
    this.logger.warn(
      `Failed-login detection tenant=${this.tenantId()} findings=${rows.length} window=${windowMinutes}m`,
    );
    return {
      type: 'FAILED_LOGIN',
      detected: rows.length,
      findings: rows as unknown as Array<Record<string, unknown>>,
      eventIds,
    };
  }

  /**
   * Suspicious activity:
   *  - one user logging in from multiple IPs in the window
   *  - failures followed by a success for the same identity (stuffing)
   */
  async detectSuspiciousActivity(
    query: DetectQueryDto,
  ): Promise<DetectionResult> {
    const windowMinutes = query.windowMinutes ?? 30;
    const tenantId = this.tenantId();
    const findings: Array<Record<string, unknown>> = [];
    const eventIds: string[] = [];

    const multiIp: SuspiciousIpRow[] = await this.dataSource.query(
      `SELECT user_id AS "userId", email,
              COUNT(*)::int AS logins,
              COUNT(DISTINCT ip_address)::int AS ips,
              array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS countries
         FROM security_login_attempts
        WHERE tenant_id = $1 AND success = true
          AND user_id IS NOT NULL
          AND created_at > now() - ($2 * interval '1 minute')
        GROUP BY user_id, email
       HAVING COUNT(DISTINCT ip_address) > 1
        ORDER BY ips DESC`,
      [tenantId, windowMinutes],
    );
    for (const row of multiIp) {
      findings.push({
        kind: 'MULTIPLE_IPS',
        userId: row.userId,
        email: row.email,
        logins: row.logins,
        ips: row.ips,
        countries: row.countries ?? [],
      });
      const event = await this.events.create({
        tenantId,
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        severity: SecuritySeverity.MEDIUM,
        source: SecurityEventSource.AUTH,
        userId: row.userId,
        actorEmail: row.email,
        riskScore: Math.min(80, 30 + row.ips * 10),
        dedupeKey: `suspicious:ips:${row.userId}:${this.bucket(windowMinutes)}`,
        metadata: {
          kind: 'MULTIPLE_IPS',
          logins: row.logins,
          distinctIps: row.ips,
          countries: row.countries ?? [],
          windowMinutes,
        },
      });
      eventIds.push(event.id);
    }

    const stuffing: Array<{
      email: string;
      failures: number;
      successes: number;
      lastIp: string | null;
    }> = await this.dataSource.query(
      `SELECT email,
              COUNT(*) FILTER (WHERE success = false)::int AS failures,
              COUNT(*) FILTER (WHERE success = true)::int AS successes,
              MAX(ip_address) FILTER (WHERE success = true) AS "lastIp"
         FROM security_login_attempts
        WHERE tenant_id = $1
          AND created_at > now() - ($2 * interval '1 minute')
        GROUP BY email
       HAVING COUNT(*) FILTER (WHERE success = false) >= 3
          AND COUNT(*) FILTER (WHERE success = true) > 0
        ORDER BY failures DESC`,
      [tenantId, windowMinutes],
    );
    for (const row of stuffing) {
      findings.push({
        kind: 'FAILED_THEN_SUCCESS',
        email: row.email,
        failures: row.failures,
        successes: row.successes,
      });
      const event = await this.events.create({
        tenantId,
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        severity: SecuritySeverity.HIGH,
        source: SecurityEventSource.AUTH,
        actorEmail: row.email,
        ipAddress: row.lastIp,
        riskScore: 80,
        dedupeKey: `suspicious:stuffing:${row.email}:${this.bucket(windowMinutes)}`,
        metadata: {
          kind: 'FAILED_THEN_SUCCESS',
          failures: row.failures,
          successes: row.successes,
          windowMinutes,
        },
      });
      eventIds.push(event.id);
    }

    this.metrics.inc('security_detections_total', {
      type: 'SUSPICIOUS_ACTIVITY',
    });
    return {
      type: 'SUSPICIOUS_ACTIVITY',
      detected: findings.length,
      findings,
      eventIds,
    };
  }


  /**
   * Geo anomaly architecture: baseline countries are learned from successful
   * logins (`security_login_locations`); any successful login from a country
   * without an *earlier* baseline row is flagged.
   */
  async detectGeoAnomalies(): Promise<DetectionResult> {
    const tenantId = this.tenantId();
    const rows: Array<{
      userId: string;
      email: string;
      country: string;
      attempts: number;
      ip: string | null;
    }> = await this.dataSource.query(
      `SELECT a.user_id AS "userId", a.email, a.country,
              COUNT(*)::int AS attempts,
              MAX(a.ip_address) AS ip
         FROM security_login_attempts a
        WHERE a.tenant_id = $1
          AND a.success = true
          AND a.anomalous = true
          AND a.created_at > now() - interval '24 hours'
        GROUP BY a.user_id, a.email, a.country
        ORDER BY attempts DESC`,
      [tenantId],
    );

    const day = new Date().toISOString().slice(0, 10);
    const eventIds: string[] = [];
    for (const row of rows) {
      if (!row.userId) continue;
      const event = await this.events.create({
        tenantId,
        eventType: SecurityEventType.GEO_ANOMALY,
        severity: SecuritySeverity.HIGH,
        source: SecurityEventSource.AUTH,
        userId: row.userId,
        actorEmail: row.email,
        ipAddress: row.ip,
        country: row.country,
        riskScore: 70,
        dedupeKey: `geo:${row.userId}:${row.country}:${day}`,
        metadata: { attempts: row.attempts },
      });
      eventIds.push(event.id);
    }

    this.metrics.inc('security_detections_total', { type: 'GEO_ANOMALY' });
    return {
      type: 'GEO_ANOMALY',
      detected: rows.length,
      findings: rows as unknown as Array<Record<string, unknown>>,
      eventIds,
    };
  }

  async detectAll(query: DetectQueryDto) {
    const failedLogins = await this.detectFailedLogins(query);
    const suspiciousActivity = await this.detectSuspiciousActivity(query);
    const geoAnomalies = await this.detectGeoAnomalies();
    return { failedLogins, suspiciousActivity, geoAnomalies };
  }

  /** Threat-monitoring snapshot for the dashboard. */
  async monitoring() {
    const tenantId = this.tenantId();
    const [events] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE severity = 'CRITICAL')::int AS critical,
              COUNT(*) FILTER (WHERE severity = 'HIGH')::int AS high,
              COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open
         FROM security_events
        WHERE tenant_id = $1 AND detected_at > now() - interval '24 hours'`,
      [tenantId],
    );
    const [logins] = await this.dataSource.query(
      `SELECT COUNT(*) FILTER (WHERE success)::int AS successes,
              COUNT(*) FILTER (WHERE NOT success)::int AS failures,
              COUNT(DISTINCT email)::int AS identities
         FROM security_login_attempts
        WHERE tenant_id = $1 AND created_at > now() - interval '24 hours'`,
      [tenantId],
    );
    const [alertRules] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE enabled)::int AS enabled,
              COALESCE(SUM(trigger_count), 0)::int AS triggered
         FROM security_alert_rules WHERE tenant_id = $1`,
      [tenantId],
    );
    const topIps: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT ip_address AS "ipAddress", COUNT(*)::int AS events
         FROM security_events
        WHERE tenant_id = $1 AND ip_address IS NOT NULL
          AND detected_at > now() - interval '24 hours'
        GROUP BY ip_address ORDER BY events DESC LIMIT 10`,
      [tenantId],
    );
    const topIdentities: Array<Record<string, unknown>> =
      await this.dataSource.query(
        `SELECT actor_email AS email, COUNT(*)::int AS events
           FROM security_events
          WHERE tenant_id = $1 AND actor_email IS NOT NULL
            AND detected_at > now() - interval '24 hours'
          GROUP BY actor_email ORDER BY events DESC LIMIT 10`,
        [tenantId],
      );
    const criticalOpen: Array<Record<string, unknown>> =
      await this.dataSource.query(
        `SELECT id, event_type AS "eventType", severity,
                actor_email AS "actorEmail", ip_address AS "ipAddress",
                risk_score AS "riskScore", detected_at AS "detectedAt"
           FROM security_events
          WHERE tenant_id = $1 AND status <> 'RESOLVED'
            AND severity IN ('CRITICAL', 'HIGH')
          ORDER BY detected_at DESC LIMIT 10`,
        [tenantId],
      );

    return {
      generatedAt: new Date().toISOString(),
      events,
      logins,
      alertRules,
      topIps,
      topIdentities,
      criticalOpen,
    };
  }
}

