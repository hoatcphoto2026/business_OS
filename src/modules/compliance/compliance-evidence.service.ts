import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { EvidenceRecord } from './entities/evidence-record.entity';
import {
  EvidenceCategory,
  EvidenceSource,
  EvidenceStatus,
  ExportFormat,
} from './enums/compliance.enum';
import {
  CollectEvidenceDto,
  CreateEvidenceDto,
  ExportQueryDto,
} from './dto/compliance.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';
import { ExportRow, toCsv, toExcelXml, toPdf } from './compliance-export.format';

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export const EVIDENCE_EXPORT_COLUMNS = [
  'code',
  'title',
  'category',
  'source',
  'status',
  'collectedAt',
  'validUntil',
  'hash',
];

@Injectable()
export class ComplianceEvidenceService {
  private readonly logger = new Logger(ComplianceEvidenceService.name);

  constructor(
    @InjectRepository(EvidenceRecord)
    private readonly evidence: Repository<EvidenceRecord>,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  private tenantId(): string {
    return this.tenantContext.getCurrentTenantId();
  }

  private userId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  async list(query: { category?: EvidenceCategory; status?: EvidenceStatus }) {
    const where: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    return this.evidence.find({
      where,
      order: { collectedAt: 'DESC' },
      take: 200,
    });
  }

  async get(id: string): Promise<EvidenceRecord> {
    const row = await this.evidence.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) throw new NotFoundException('Evidence record not found');
    return row;
  }

  async create(dto: CreateEvidenceDto): Promise<EvidenceRecord> {
    const tenantId = this.tenantId();
    const existing = await this.evidence.findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Evidence code "${dto.code}" already exists`);
    }

    const payload = dto.payload ?? {};
    const row = await this.evidence.save(
      this.evidence.create({
        tenantId,
        code: dto.code,
        title: dto.title,
        category: dto.category,
        source: dto.source ?? EvidenceSource.MANUAL,
        status: EvidenceStatus.COLLECTED,
        collectedAt: new Date(),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        hash: this.hash({
          code: dto.code,
          title: dto.title,
          category: dto.category,
          payload,
        }),
        payload,
        notes: dto.notes ?? null,
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe(row.id, AuditAction.CREATE, {
      code: row.code,
      category: row.category,
      source: row.source,
    });
    this.metrics.inc('compliance_evidence_collected_total', { category: row.category });
    return row;
  }

  async verify(id: string, notes?: string): Promise<EvidenceRecord> {
    const row = await this.get(id);
    const before = row.status;
    row.status = EvidenceStatus.VERIFIED;
    if (notes) row.notes = notes;
    row.updatedBy = this.userId();
    const saved = await this.evidence.save(row);
    await this.auditSafe(saved.id, AuditAction.APPROVE, {
      before,
      status: saved.status,
      hash: saved.hash,
    });
    return saved;
  }

  /**
   * Evidence Collection: snapshots the tenant's current compliance posture from
   * the platform itself (audit, access, security, operations).
   */
  async collect(dto: CollectEvidenceDto = {}): Promise<EvidenceRecord[]> {
    const tenantId = this.tenantId();
    const wanted = new Set(
      dto.categories ?? [
        EvidenceCategory.SECURITY,
        EvidenceCategory.ACCESS,
        EvidenceCategory.AUDIT,
        EvidenceCategory.OPERATIONS,
      ],
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const candidates: Array<{
      category: EvidenceCategory;
      code: string;
      title: string;
      source: EvidenceSource;
      payload: Record<string, unknown>;
    }> = [];

    if (wanted.has(EvidenceCategory.AUDIT)) {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS events,
                COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last30d
           FROM audit_logs WHERE tenant_id = $1`,
        [tenantId],
      );
      candidates.push({
        category: EvidenceCategory.AUDIT,
        code: `AUDIT-${stamp}`,
        title: 'Audit log coverage',
        source: EvidenceSource.AUDIT,
        payload: { totalEvents: row.events, last30d: row.last30d },
      });
    }

    if (wanted.has(EvidenceCategory.ACCESS)) {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS members,
                COUNT(*) FILTER (WHERE status = 'active')::int AS active
           FROM tenant_users WHERE tenant_id = $1`,
        [tenantId],
      );
      candidates.push({
        category: EvidenceCategory.ACCESS,
        code: `ACCESS-${stamp}`,
        title: 'Tenant access baseline',
        source: EvidenceSource.SYSTEM,
        payload: { memberships: row.members, active: row.active },
      });
    }

    if (wanted.has(EvidenceCategory.SECURITY)) {
      const [row] = await this.dataSource.query(
        `SELECT (SELECT COUNT(*)::int FROM identity_providers WHERE tenant_id = $1) AS providers,
                (SELECT COUNT(*)::int FROM identity_providers WHERE tenant_id = $1 AND enabled) AS enabled_providers,
                (SELECT COUNT(*)::int FROM scim_endpoints WHERE tenant_id = $1) AS scim_endpoints,
                (SELECT COUNT(*)::int FROM api_keys WHERE tenant_id = $1) AS api_keys`,
        [tenantId],
      );
      candidates.push({
        category: EvidenceCategory.SECURITY,
        code: `SECURITY-${stamp}`,
        title: 'Identity & API surface',
        source: EvidenceSource.SSO,
        payload: row,
      });
    }

    if (wanted.has(EvidenceCategory.OPERATIONS)) {
      const [row] = await this.dataSource.query(
        `SELECT (SELECT COUNT(*)::int FROM scheduled_jobs WHERE tenant_id = $1) AS jobs,
                (SELECT COUNT(*)::int FROM scim_provisioning_logs WHERE tenant_id = $1) AS provisioning_logs,
                (SELECT COUNT(*)::int FROM support_tickets WHERE tenant_id = $1) AS tickets`,
        [tenantId],
      );
      candidates.push({
        category: EvidenceCategory.OPERATIONS,
        code: `OPS-${stamp}`,
        title: 'Operational controls',
        source: EvidenceSource.SYSTEM,
        payload: row,
      });
    }

    const collected: EvidenceRecord[] = [];
    for (const candidate of candidates) {
      const hash = this.hash(candidate);
      const existing = await this.evidence.findOne({
        where: { tenantId, code: candidate.code },
      });
      if (existing) {
        existing.title = candidate.title;
        existing.source = candidate.source;
        existing.payload = candidate.payload;
        existing.hash = hash;
        existing.status = EvidenceStatus.COLLECTED;
        existing.collectedAt = new Date();
        existing.updatedBy = this.userId();
        collected.push(await this.evidence.save(existing));
        continue;
      }
      collected.push(
        await this.evidence.save(
          this.evidence.create({
            tenantId,
            code: candidate.code,
            title: candidate.title,
            category: candidate.category,
            source: candidate.source,
            status: EvidenceStatus.COLLECTED,
            collectedAt: new Date(),
            hash,
            payload: candidate.payload,
            createdBy: this.userId(),
          }),
        ),
      );
    }

    for (const row of collected) {
      await this.auditSafe(row.id, AuditAction.CREATE, {
        code: row.code,
        category: row.category,
        collected: true,
      });
      this.metrics.inc('compliance_evidence_collected_total', {
        category: row.category,
      });
    }
    this.logger.log(`Collected ${collected.length} evidence records for tenant ${tenantId}`);
    return collected;
  }


  async export(query: ExportQueryDto): Promise<ExportResult> {
    const rows = await this.list({ category: query.category });
    const data: ExportRow[] = rows.map((row) => ({
      code: row.code,
      title: row.title,
      category: row.category,
      source: row.source,
      status: row.status,
      collectedAt: row.collectedAt,
      validUntil: row.validUntil,
      hash: row.hash,
    }));
    const format = query.format ?? ExportFormat.CSV;

    if (format === ExportFormat.CSV) {
      this.metrics.inc('compliance_exports_total', { format: 'csv' });
      return {
        buffer: Buffer.from(toCsv(EVIDENCE_EXPORT_COLUMNS, data)),
        contentType: 'text/csv; charset=utf-8',
        filename: `compliance-evidence-${Date.now()}.csv`,
      };
    }
    if (format === ExportFormat.EXCEL) {
      this.metrics.inc('compliance_exports_total', { format: 'excel' });
      return {
        buffer: Buffer.from(toExcelXml(EVIDENCE_EXPORT_COLUMNS, data, 'Evidence')),
        contentType: 'application/vnd.ms-excel; charset=utf-8',
        filename: `compliance-evidence-${Date.now()}.xls`,
      };
    }
    this.metrics.inc('compliance_exports_total', { format: 'pdf' });
    return {
      buffer: toPdf(EVIDENCE_EXPORT_COLUMNS, data, 'Business OS – Compliance Evidence'),
      contentType: 'application/pdf',
      filename: `compliance-evidence-${Date.now()}.pdf`,
    };
  }

  async summary(): Promise<{ total: number; verified: number; expired: number }> {
    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified,
              COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS expired
         FROM compliance_evidence WHERE tenant_id = $1`,
      [this.tenantId()],
    );
    return row;
  }

  /** Deterministic sha256 over the canonical evidence payload. */
  hash(value: Record<string, unknown>): string {
    const canonical = Object.keys(value)
      .sort()
      .map((key) => `${key}=${JSON.stringify(value[key])}`)
      .join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  private async auditSafe(
    id: string,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('compliance_evidence', id, action, { newData: data });
    } catch (error) {
      this.logger.warn(
        `Compliance evidence audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

