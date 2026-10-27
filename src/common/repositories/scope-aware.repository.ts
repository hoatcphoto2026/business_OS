import {
  Repository,
  FindOptionsWhere,
  FindManyOptions,
  FindOneOptions,
  DeepPartial,
  SaveOptions,
} from 'typeorm';
import { BaseOrganizationEntity } from '../entities/base.entity';
import { TenantContextService } from '../tenant-context/tenant-context.service';
import { ScopeService, ScopeFilter } from '../../modules/scope/scope.service';

/**
 * ScopeAwareRepository – Sprint 4
 *
 * Builds on OrganizationAwareRepository pattern but injects Data Scope filter
 * based on the current user's effective scope for the resource.
 *
 * Resource name is passed at construction (e.g. "customer", "sales_order").
 */
export class ScopeAwareRepository<T extends BaseOrganizationEntity> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly tenantContext: TenantContextService,
    private readonly scopeService: ScopeService,
    private readonly resource: string,
  ) {}

  private async getFilter(): Promise<ScopeFilter> {
    const userId = this.tenantContext.getCurrentUserId();
    return this.scopeService.getScopeFilter(userId, this.resource);
  }

  private async withScope(
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): Promise<FindOptionsWhere<T> | FindOptionsWhere<T>[]> {
    const filter = await this.getFilter();
    const scopeWhere = filter.conditions as any;

    if (!where) return scopeWhere;
    if (Array.isArray(where)) {
      return where.map((w) => ({ ...w, ...scopeWhere }));
    }
    return { ...where, ...scopeWhere };
  }

  async findAll(
    options?: Omit<FindManyOptions<T>, 'where'> & {
      where?: FindOptionsWhere<T>;
    },
  ): Promise<T[]> {
    const where = await this.withScope(options?.where);
    return this.repository.find({
      ...options,
      where,
    });
  }

  async findById(id: string): Promise<T | null> {
    const where = await this.withScope({ id } as any);
    return this.repository.findOne({ where });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    const where = await this.withScope(options.where as any);
    return this.repository.findOne({
      ...options,
      where,
    });
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    const scoped = await this.withScope(where);
    return this.repository.count({ where: scoped });
  }

  create(data: DeepPartial<T>): T {
    const userId = this.tenantContext.tryGetUserId();
    return this.repository.create({
      ...data,
      tenantId: this.tenantContext.getCurrentTenantId(),
      companyId: this.tenantContext.tryGetCompanyId(),
      branchId: this.tenantContext.tryGetBranchId(),
      ownerId: userId,
      createdBy: userId,
      updatedBy: userId,
    } as DeepPartial<T>);
  }

  async save(entity: T | DeepPartial<T>, options?: SaveOptions): Promise<T> {
    const userId = this.tenantContext.tryGetUserId();
    const stamped: any = {
      ...entity,
      tenantId: this.tenantContext.getCurrentTenantId(),
      updatedBy: userId,
    };
    if (!(entity as any).ownerId && userId) {
      stamped.ownerId = userId;
    }
    if (!(entity as any).id && !(entity as any).createdBy) {
      stamped.createdBy = userId;
    }
    return this.repository.save(stamped, options);
  }

  async remove(entity: T): Promise<void> {
    await this.repository.remove(entity);
  }

  createQueryBuilder(alias: string) {
    const qb = this.repository.createQueryBuilder(alias);
    // Note: caller should await and apply filter if needed, or use the async method below
    return qb;
  }

  /**
   * Preferred: get a QueryBuilder already filtered by scope.
   */
  async createScopedQueryBuilder(alias: string) {
    const filter = await this.getFilter();
    const qb = this.repository.createQueryBuilder(alias);
    if (filter.applyToQueryBuilder) {
      filter.applyToQueryBuilder(qb, alias);
    }
    return qb;
  }
}
