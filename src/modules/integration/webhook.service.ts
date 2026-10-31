import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './entities/webhook.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { assertSafeWebhookUrl } from '../../common/security/ssrf';
import * as crypto from 'crypto';

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(Webhook) private readonly repo: Repository<Webhook>,
    private readonly tenantContext: TenantContextService,
  ) {}

  private toPublic(wh: Webhook, includeSecret = false) {
    const base = {
      id: wh.id,
      name: wh.name,
      url: wh.url,
      events: wh.events,
      status: wh.status,
      createdAt: wh.createdAt,
      updatedAt: wh.updatedAt,
    };
    return includeSecret ? { ...base, secret: wh.secret } : base;
  }

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const rows = await this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    return rows.map((w) => this.toPublic(w));
  }

  async create(data: { name: string; url: string; events: string[] }) {
    await assertSafeWebhookUrl(data.url);
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.tryGetUserId();
    const secret = crypto.randomBytes(16).toString('hex');
    const entity = this.repo.create({
      tenantId,
      name: data.name,
      url: data.url,
      events: data.events || [],
      secret,
      status: 'active',
      createdBy: userId,
    });
    const saved = await this.repo.save(entity);
    return this.toPublic(saved, true);
  }

  async update(id: string, data: { name?: string; url?: string; events?: string[]; status?: string }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const wh = await this.repo.findOne({ where: { id, tenantId } });
    if (!wh) throw new NotFoundException('Webhook not found');
    if (data.name !== undefined) wh.name = data.name;
    if (data.url !== undefined) {
      await assertSafeWebhookUrl(data.url);
      wh.url = data.url;
    }
    if (data.events !== undefined) wh.events = data.events;
    if (data.status !== undefined) wh.status = data.status;
    const saved = await this.repo.save(wh);
    return this.toPublic(saved);
  }

  async remove(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const wh = await this.repo.findOne({ where: { id, tenantId } });
    if (!wh) throw new NotFoundException('Webhook not found');
    await this.repo.remove(wh);
    return { deleted: true };
  }

  async findByEvent(tenantId: string, event: string) {
    return this.repo
      .createQueryBuilder('w')
      .where('w.tenant_id = :tenantId', { tenantId })
      .andWhere('w.status = :status', { status: 'active' })
      .andWhere('w.events @> :eventJson', { eventJson: JSON.stringify([event]) })
      .getMany();
  }
}
