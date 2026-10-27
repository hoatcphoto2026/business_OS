import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connector } from './entities/connector.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

const AVAILABLE = ['shopee', 'tiktok_shop', 'momo', 'vietqr', 'bank', 'einvoice', 'pos'];

@Injectable()
export class ConnectorService {
  constructor(
    @InjectRepository(Connector) private readonly repo: Repository<Connector>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list() {
    const tenantId = this.tenantContext.getCurrentTenantId();
    return this.repo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  available() {
    return AVAILABLE.map((code) => ({ code, name: code.replace('_', ' ').toUpperCase() }));
  }

  async create(data: { code: string; name: string; config?: Record<string, unknown> }) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const userId = this.tenantContext.tryGetUserId();
    const entity = this.repo.create({
      tenantId,
      code: data.code,
      name: data.name,
      config: data.config ?? null,
      status: 'inactive',
      createdBy: userId,
    });
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<Connector>) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Connector not found');
    Object.assign(c, data);
    return this.repo.save(c);
  }

  async test(id: string) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Connector not found');
    // Mock test
    return { success: true, connector: c.code, message: 'Mock connection successful', testedAt: new Date().toISOString() };
  }
}
