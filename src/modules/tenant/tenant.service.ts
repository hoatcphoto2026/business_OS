import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantUser, MembershipStatus } from './entities/tenant-user.entity';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { seedMasterDataDefaults } from '../master-data/master-data.seeder';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantUser)
    private readonly membershipRepo: Repository<TenantUser>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const byCode = await this.tenantRepo.findOne({ where: { code: dto.code } });
    if (byCode) {
      throw new ConflictException(`Tenant code "${dto.code}" already exists`);
    }
    const bySlug = await this.tenantRepo.findOne({ where: { slug: dto.slug } });
    if (bySlug) {
      throw new ConflictException(`Tenant slug "${dto.slug}" already exists`);
    }

    const tenant = this.tenantRepo.create({
      code: dto.code,
      slug: dto.slug,
      name: dto.name,
      plan: dto.plan,
      status: dto.status,
      settings: (dto.settings ?? {}) as Record<string, unknown>,
    });

    const saved = await this.tenantRepo.save(tenant);

    // Phase 2: auto-seed Master Data defaults for new tenant
    try {
      const result = await seedMasterDataDefaults(this.dataSource, saved.id);
      this.logger.log(`Seeded Master Data for tenant ${saved.code}: ${JSON.stringify(result)}`);
    } catch (err: any) {
      this.logger.error(`Failed to seed Master Data for tenant ${saved.id}: ${err.message}`);
      // Do not fail tenant creation if seed fails
    }

    return saved;
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async findByCode(code: string): Promise<Tenant | null> {
    return this.tenantRepo.findOne({ where: { code } });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantRepo.findOne({ where: { slug } });
  }

  async update(id: string, dto: UpdateTenantDto, callerTenantId?: string): Promise<Tenant> {
    if (!callerTenantId || id !== callerTenantId) {
      throw new ForbiddenException('Cannot modify another tenant');
    }
    const tenant = await this.findById(id);

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.plan !== undefined) tenant.plan = dto.plan;
    if (dto.status !== undefined) tenant.status = dto.status;
    if (dto.settings !== undefined) {
      tenant.settings = dto.settings as Record<string, unknown>;
    }

    return this.tenantRepo.save(tenant);
  }

  async listForUser(userId: string): Promise<Tenant[]> {
    const memberships = await this.membershipRepo.find({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
    const ids = memberships.map((m) => m.tenantId);
    if (!ids.length) return [];
    return this.tenantRepo.find({
      where: { id: In(ids) },
      order: { createdAt: 'DESC' },
    });
  }
}
