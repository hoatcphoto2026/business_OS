import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantSetting } from '../entities/tenant-setting.entity';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { EventBus } from '../../event/event-bus.service';
import { EventType } from '../../event/enums/event-type.enum';

@Injectable()
export class SettingsManagementService {
  private readonly logger = new Logger(SettingsManagementService.name);

  constructor(
    @InjectRepository(TenantSetting) private readonly settings: Repository<TenantSetting>,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async get() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    try {
      let setting = await this.settings.findOne({ where: { tenantId } });
      if (!setting) {
        setting = await this.settings.save(this.settings.create({ tenantId }));
      }
      return setting;
    } catch (err) {
      this.logger.error(`Failed to get tenant settings: ${(err as Error).message}`);
      throw new InternalServerErrorException('Could not load tenant settings');
    }
  }

  async update(data: {
    timezone?: string;
    currency?: string;
    language?: string;
    dateFormat?: string;
    businessMode?: string;
    accountingMode?: string;
    copilotEnabled?: boolean;
    notificationEnabled?: boolean;
  }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    let setting = await this.settings.findOne({ where: { tenantId } });
    if (!setting) setting = this.settings.create({ tenantId });

    const before = { ...setting };
    if (data.timezone !== undefined) setting.timezone = data.timezone;
    if (data.currency !== undefined) setting.currency = data.currency;
    if (data.language !== undefined) setting.language = data.language;
    if (data.dateFormat !== undefined) setting.dateFormat = data.dateFormat;
    if (data.businessMode !== undefined) setting.businessMode = data.businessMode;
    if (data.accountingMode !== undefined) setting.accountingMode = data.accountingMode;
    if (data.copilotEnabled !== undefined) setting.copilotEnabled = data.copilotEnabled;
    if (data.notificationEnabled !== undefined) setting.notificationEnabled = data.notificationEnabled;
    const saved = await this.settings.save(setting);

    await this.auditService.logUpdate('tenant_setting', before, saved);
    await this.eventBus.publish(EventType.SettingsUpdated, 'tenant_setting', saved.id, { changes: data });

    return saved;
  }
}
