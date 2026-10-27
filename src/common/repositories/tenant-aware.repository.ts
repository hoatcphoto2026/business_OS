import {
  Repository,
  FindOptionsWhere,
  FindManyOptions,
  FindOneOptions,
  DeepPartial,
  SaveOptions,
} from 'typeorm';
import { BaseTenantEntity } from '../entities/base.entity';
import { TenantContextService } from '../tenant-context/tenant-context.service';

/**
 * TenantAwareRepository<T>
 *
 * Impossible for a developer to forget the tenant filter.
 *
 * Usage:
 *   this.customerRepo.scoped().findAll()
 *   this.customerRepo.scoped().findById(id)
 *   this.customerRepo.scoped().save(data)   // stamps tenantId + createdBy/updatedBy
 *
 * Raw TypeORM Repository is NOT exposed publicly.
 */
export class TenantAwareRepository<T extends BaseTenantEntity> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly tenantContext: TenantContextService,
  ) {}

  forTenant(tenantId: string): ScopedTenantRepository<T> {
    return new ScopedTenantRepository(
      this.repository,
      tenantId,
      this.tenantContext,
    );
  }

  /** Use current request tenant from ALS */
  scoped(): ScopedTenantRepository<T> {
    return this.forTenant(this.tenantContext.getCurrentTenantId());
  }
}

export class ScopedTenantRepository<T extends BaseTenantEntity> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly tenantId: string,
    private readonly tenantContext: TenantContextService,
  ) {}

  private withTenant(
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (!where) {
      return { tenantId: this.tenantId } as FindOptionsWhere<T>;
    }
    if (Array.isArray(where)) {
      return where.map((w) => ({ ...w, tenantId: this.tenantId }));
    }
    return { ...where, tenantId: this.tenantId };
  }

  async findAll(
    options?: Omit<FindManyOptions<T>, 'where'> & {
      where?: FindOptionsWhere<T>;
    },
  ): Promise<T[]> {
    return this.repository.find({
      ...options,
      where: this.withTenant(options?.where),
    });
  }

  async findById(id: string): Promise<T | null> {
    return this.repository.findOne({
      where: this.withTenant({ id } as FindOptionsWhere<T>),
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne({
      ...options,
      where: this.withTenant(options.where as FindOptionsWhere<T>),
    });
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repository.count({ where: this.withTenant(where) });
  }

  create(data: DeepPartial<T>): T {
    const userId = this.tenantContext.tryGetUserId();
    return this.repository.create({
      ...data,
      tenantId: this.tenantId,
      createdBy: userId,
      updatedBy: userId,
    } as DeepPartial<T>);
  }

  async save(entity: T | DeepPartial<T>, options?: SaveOptions): Promise<T> {
    const userId = this.tenantContext.tryGetUserId();
    const stamped = {
      ...entity,
      tenantId: this.tenantId,
      updatedBy: userId,
    } as T;
    // Only set createdBy on first insert
    if (!(entity as any).id && !(entity as any).createdBy) {
      (stamped as any).createdBy = userId;
    }
    return this.repository.save(stamped, options);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({
      id,
      tenantId: this.tenantId,
    } as FindOptionsWhere<T>);
  }

  createQueryBuilder(alias: string) {
    return this.repository
      .createQueryBuilder(alias)
      .andWhere(`${alias}.tenant_id = :tenantId`, { tenantId: this.tenantId });
  }
}
