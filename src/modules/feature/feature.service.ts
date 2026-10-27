import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feature } from './entities/feature.entity';
import { TenantFeature } from './entities/tenant-feature.entity';
import { FeatureCode, PlanCode } from './enums/feature.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';

/**
 * Default plan presets – Sprint 8
 * Used by seeder and by enable-by-plan helpers.
 */
export const PLAN_FEATURES: Record<PlanCode, FeatureCode[]> = {
  [PlanCode.STARTER]: [FeatureCode.SALES, FeatureCode.CRM],
  [PlanCode.GROWTH]: [FeatureCode.SALES, FeatureCode.CRM, FeatureCode.INVENTORY],
  [PlanCode.BUSINESS]: [
    FeatureCode.SALES,
    FeatureCode.CRM,
    FeatureCode.INVENTORY,
    FeatureCode.ACCOUNTING,
    FeatureCode.TAX,
  ],
  [PlanCode.ENTERPRISE]: Object.values(FeatureCode),
};

@Injectable()
export class FeatureService {
  private readonly logger = new Logger(FeatureService.name);
  private cache = new Map<string, Set<string>>();

  constructor(
    @InjectRepository(Feature)
    private readonly features: Repository<Feature>,
    @InjectRepository(TenantFeature)
    private readonly tenantFeatures: Repository<TenantFeature>,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async isEnabled(tenantId: string, featureCode: string): Promise<boolean> {
    const enabled = await this.getEnabledCodes(tenantId);
    return enabled.has(featureCode);
  }

  async getEnabledCodes(tenantId: string): Promise<Set<string>> {
    if (this.cache.has(tenantId)) {
      return this.cache.get(tenantId)!;
    }

    const rows = await this.tenantFeatures
      .createQueryBuilder('tf')
      .innerJoin('tf.feature', 'f')
      .where('tf.tenant_id = :tenantId', { tenantId })
      .andWhere('tf.enabled = true')
      .andWhere('f.status = :status', { status: 'active' })
      .select('f.code', 'code')
      .getRawMany<{ code: string }>();

    const set = new Set(rows.map((r) => r.code));
    this.cache.set(tenantId, set);
    return set;
  }

  clearCache(tenantId?: string): void {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }

  async getCatalog(): Promise<Feature[]> {
    return this.features.find({ order: { category: 'ASC', code: 'ASC' } });
  }

  async getTenantFeatures(tenantId?: string): Promise<
    Array<{
      code: string;
      name: string;
      category: string | null;
      enabled: boolean;
      enabledAt: Date | null;
    }>
  > {
    const tid = tenantId ?? this.tenantContext.getContext()?.tenantId;
    if (!tid) return [];

    const catalog = await this.getCatalog();
    const enabled = await this.getEnabledCodes(tid);
    const rows = await this.tenantFeatures.find({
      where: { tenantId: tid },
      relations: ['feature'],
    });
    const byCode = new Map(rows.map((r) => [r.feature?.code, r]));

    return catalog.map((f) => ({
      code: f.code,
      name: f.name,
      category: f.category,
      enabled: enabled.has(f.code),
      enabledAt: byCode.get(f.code)?.enabledAt ?? null,
    }));
  }

  async enableFeature(
    featureCode: string,
    tenantId?: string,
    actorId?: string | null,
  ): Promise<{ code: string; enabled: true }> {
    const tid = tenantId ?? this.tenantContext.getContext()?.tenantId;
    if (!tid) throw new NotFoundException('Tenant context required');

    const feature = await this.features.findOne({ where: { code: featureCode } });
    if (!feature) throw new NotFoundException(`Feature '${featureCode}' not found`);

    const userId = actorId ?? this.tenantContext.getContext()?.userId ?? null;

    let row = await this.tenantFeatures.findOne({
      where: { tenantId: tid, featureId: feature.id },
    });

    if (!row) {
      row = this.tenantFeatures.create({
        tenantId: tid,
        featureId: feature.id,
        enabled: true,
        enabledAt: new Date(),
        enabledBy: userId,
      });
    } else {
      row.enabled = true;
      row.enabledAt = new Date();
      row.enabledBy = userId;
    }
    await this.tenantFeatures.save(row);
    this.clearCache(tid);

    // Audit (who)
    await this.auditService.logAction(
      'feature',
      feature.id,
      AuditAction.UPDATE,
      {
        newData: { action: 'ENABLE', featureCode, tenantId: tid },
      },
    );

    // Event (what)
    await this.eventBus.publish(
      EventType.FeatureEnabled,
      'feature',
      feature.id,
      { featureCode, tenantId: tid },
      { tenantId: tid },
    );

    this.logger.log(`Enabled feature ${featureCode} for tenant ${tid}`);
    return { code: featureCode, enabled: true };
  }

  async disableFeature(
    featureCode: string,
    tenantId?: string,
  ): Promise<{ code: string; enabled: false }> {
    const tid = tenantId ?? this.tenantContext.getContext()?.tenantId;
    if (!tid) throw new NotFoundException('Tenant context required');

    const feature = await this.features.findOne({ where: { code: featureCode } });
    if (!feature) throw new NotFoundException(`Feature '${featureCode}' not found`);

    const row = await this.tenantFeatures.findOne({
      where: { tenantId: tid, featureId: feature.id },
    });

    if (row) {
      row.enabled = false;
      row.enabledAt = null;
      await this.tenantFeatures.save(row);
    }
    this.clearCache(tid);

    await this.auditService.logAction(
      'feature',
      feature.id,
      AuditAction.UPDATE,
      {
        newData: { action: 'DISABLE', featureCode, tenantId: tid },
      },
    );

    await this.eventBus.publish(
      EventType.FeatureDisabled,
      'feature',
      feature.id,
      { featureCode, tenantId: tid },
      { tenantId: tid },
    );

    this.logger.log(`Disabled feature ${featureCode} for tenant ${tid}`);
    return { code: featureCode, enabled: false };
  }

  async applyPlan(plan: PlanCode, tenantId: string, actorId?: string | null): Promise<void> {
    const codes = PLAN_FEATURES[plan] ?? [];
    const all = Object.values(FeatureCode);
    for (const code of all) {
      if (codes.includes(code)) {
        await this.enableFeature(code, tenantId, actorId);
      } else {
        await this.disableFeature(code, tenantId);
      }
    }
  }
}
