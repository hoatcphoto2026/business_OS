import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from './entities/api-key.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey) private readonly repo: Repository<ApiKey>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const rows = await this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    return rows.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      status: k.status,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
  }

  async create(name: string, expiresAt?: Date) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.tryGetUserId();
    const plain = `bos_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = plain.slice(0, 12);
    const hash = crypto.createHash('sha256').update(plain).digest('hex');

    const entity = this.repo.create({
      tenantId,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      status: 'active',
      expiresAt: expiresAt ?? null,
      createdBy: userId,
    });
    const saved = await this.repo.save(entity);
    return { ...saved, plainKey: plain }; // plain key returned only once
  }

  async revoke(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const key = await this.repo.findOne({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API Key not found');
    key.status = 'revoked';
    return this.repo.save(key);
  }
}
