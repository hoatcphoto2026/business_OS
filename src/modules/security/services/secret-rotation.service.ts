import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKey } from '../../integration/entities/api-key.entity';
import { Webhook } from '../../integration/entities/webhook.entity';
import { SecretRotation } from '../entities/secret-rotation.entity';
import {
  SecretResourceType,
  SecurityEventSource,
  SecurityEventType,
  SecuritySeverity,
} from '../enums/security.enum';
import { RotateSecretDto } from '../dto/security.dto';
import { SecurityEventsService } from './security-events.service';
import { ScimAdminService } from '../../scim/scim-admin.service';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { MetricsService } from '../../../common/metrics/metrics.service';

export interface RotatedSecret {
  resourceType: SecretResourceType;
  id: string;
  name: string;
  /** Plaintext credential – returned exactly once. */
  secret: string;
  prefix?: string;
  rotatedAt: Date;
}

@Injectable()
export class SecretRotationService {
  private readonly logger = new Logger(SecretRotationService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeys: Repository<ApiKey>,
    @InjectRepository(Webhook)
    private readonly webhooks: Repository<Webhook>,
    @InjectRepository(SecretRotation)
    private readonly rotations: Repository<SecretRotation>,
    private readonly events: SecurityEventsService,
    private readonly scim: ScimAdminService,
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

  async rotateApiKey(id: string, dto: RotateSecretDto): Promise<RotatedSecret> {
    const key = await this.apiKeys.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!key) throw new NotFoundException('API key not found');

    const plain = `bos_${randomBytes(24).toString('hex')}`;
    key.keyHash = createHash('sha256').update(plain).digest('hex');
    key.keyPrefix = plain.slice(0, 12);
    key.updatedBy = this.userId();
    await this.apiKeys.save(key);

    const rotatedAt = await this.record(
      SecretResourceType.API_KEY,
      key.id,
      key.name,
      dto.reason,
      { prefix: key.keyPrefix },
    );
    return {
      resourceType: SecretResourceType.API_KEY,
      id: key.id,
      name: key.name,
      secret: plain,
      prefix: key.keyPrefix,
      rotatedAt,
    };
  }

  async rotateScimToken(
    endpointId: string,
    dto: RotateSecretDto,
  ): Promise<RotatedSecret> {
    const endpoint = await this.scim.rotateToken(endpointId);
    const rotatedAt = await this.record(
      SecretResourceType.SCIM_TOKEN,
      endpoint.id,
      endpoint.name,
      dto.reason,
      {},
    );
    return {
      resourceType: SecretResourceType.SCIM_TOKEN,
      id: endpoint.id,
      name: endpoint.name,
      secret: endpoint.token,
      rotatedAt,
    };
  }

  async rotateWebhookSecret(
    id: string,
    dto: RotateSecretDto,
  ): Promise<RotatedSecret> {
    const hook = await this.webhooks.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!hook) throw new NotFoundException('Webhook not found');

    const secret = randomBytes(16).toString('hex');
    hook.secret = secret;
    hook.updatedBy = this.userId();
    await this.webhooks.save(hook);

    const rotatedAt = await this.record(
      SecretResourceType.WEBHOOK_SECRET,
      hook.id,
      hook.name,
      dto.reason,
      { url: hook.url },
    );
    return {
      resourceType: SecretResourceType.WEBHOOK_SECRET,
      id: hook.id,
      name: hook.name,
      secret,
      rotatedAt,
    };
  }

  async list(): Promise<SecretRotation[]> {
    return this.rotations.find({
      where: { tenantId: this.tenantId() },
      order: { rotatedAt: 'DESC' },
      take: 200,
    });
  }

  private async record(
    resourceType: SecretResourceType,
    resourceId: string,
    resourceName: string | null,
    reason: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<Date> {
    const rotatedAt = new Date();
    const rotation = await this.rotations.save(
      this.rotations.create({
        tenantId: this.tenantId(),
        resourceType,
        resourceId,
        resourceName,
        reason: reason ?? null,
        rotatedBy: this.userId(),
        rotatedAt,
        metadata,
        createdBy: this.userId(),
      }),
    );

    await this.events.create({
      tenantId: this.tenantId(),
      eventType: SecurityEventType.SECRET_ROTATED,
      severity: SecuritySeverity.LOW,
      source: SecurityEventSource.SECURITY,
      riskScore: 10,
      metadata: { resourceType, resourceId, resourceName, reason: reason ?? null },
    });
    this.metrics.inc('security_secret_rotations_total', { resource_type: resourceType });

    try {
      await this.audit.logAction(
        'security_secret_rotation',
        rotation.id,
        AuditAction.CREATE,
        {
          newData: { resourceType, resourceId, resourceName, reason: reason ?? null },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Rotation audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
    return rotatedAt;
  }
}
