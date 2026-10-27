import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CopilotSetting } from '../entities/copilot-setting.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class CopilotSettingsService {
  constructor(
    @InjectRepository(CopilotSetting) private readonly settings: Repository<CopilotSetting>,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
  ) {}

  async get() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    let setting = await this.settings.findOne({ where: { tenantId } });
    if (!setting) {
      setting = await this.settings.save(this.settings.create({ tenantId }));
    }
    return setting;
  }

  async update(data: {
    enabled?: boolean;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    let setting = await this.settings.findOne({ where: { tenantId } });
    if (!setting) setting = this.settings.create({ tenantId });

    const before = { ...setting };
    if (data.enabled !== undefined) setting.enabled = data.enabled;
    if (data.provider !== undefined) setting.provider = data.provider;
    if (data.temperature !== undefined) setting.temperature = data.temperature;
    if (data.maxTokens !== undefined) setting.maxTokens = data.maxTokens;
    if (data.systemPrompt !== undefined) setting.systemPrompt = data.systemPrompt;
    const saved = await this.settings.save(setting);

    await this.auditService.logUpdate('copilot_setting', before, saved);
    return saved;
  }
}
