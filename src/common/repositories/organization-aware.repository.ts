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

/**
 * OrganizationAwareRepository – Sprint 2
 *
 * Extends tenant isolation with company / branch filtering based on context.
 *
 * Rules:
 * - Always filter by tenantId
 * - If context.companyId is set → also filter by companyId
 * - If context.branchId is set → also filter by branchId
 *   (null branchId in context = company-level access, sees all branches)
 *
 * On create/save: stamps tenantId, companyId, branchId, createdBy, updatedBy
 * from current Organization Context.
 */
export class OrganizationAwareRepository<T extends BaseOrganizationEntity> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get tenantId(): string {
    return this.tenantContext.getCurrentTenantId();
  }

  private get companyId(): string | null {
    return this.tenantContext.tryGetCompanyId();
  }

  private get branchId(): string | null {
    return this.tenantContext.tryGetBranchId();
  }

  private withOrg(
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const orgFilter: any = { tenantId: this.tenantId };
    if (this.companyId) orgFilter.companyId = this.companyId;
    if (this.branchId) orgFilter.branchId = this.branchId;

    if (!where) return orgFilter as FindOptionsWhere<T>;
    if (Array.isArray(where)) {
      return where.map((w) => ({ ...w, ...orgFilter }));
    }
    return { ...where, ...orgFilter };
  }

  async findAll(
    options?: Omit<FindManyOptions<T>, 'where'> & {
      where?: FindOptionsWhere<T>;
    },
  ): Promise<T[]> {
    return this.repository.find({
      ...options,
      where: this.withOrg(options?.where),
    });
  }

  async findById(id: string): Promise<T | null> {
    return this.repository.findOne({
      where: this.withOrg({ id } as any),
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne({
      ...options,
      where: this.withOrg(options.where as any),
    });
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repository.count({ where: this.withOrg(where) });
  }

  create(data: DeepPartial<T>): T {
    const userId = this.tenantContext.tryGetUserId();
    return this.repository.create({
      ...data,
      tenantId: this.tenantId,
      companyId: this.companyId,
      branchId: this.branchId,
      createdBy: userId,
      updatedBy: userId,
    } as DeepPartial<T>);
  }

  async save(entity: T | DeepPartial<T>, options?: SaveOptions): Promise<T> {
    const userId = this.tenantContext.tryGetUserId();
    const stamped: any = {
      ...entity,
      tenantId: this.tenantId,
      updatedBy: userId,
    };
    // Stamp company/branch only if not already set and context has them
    if (!(entity as any).companyId && this.companyId) {
      stamped.companyId = this.companyId;
    }
    if (!(entity as any).branchId && this.branchId) {
      stamped.branchId = this.branchId;
    }
    if (!(entity as any).id && !(entity as any).createdBy) {
      stamped.createdBy = userId;
    }
    return this.repository.save(stamped, options);
  }

  async delete(id: string): Promise<void> {
    const where: any = { id, tenantId: this.tenantId };
    if (this.companyId) where.companyId = this.companyId;
    if (this.branchId) where.branchId = this.branchId;
    await this.repository.delete(where);
  }

  createQueryBuilder(alias: string) {
    let qb = this.repository
      .createQueryBuilder(alias)
      .andWhere(`${alias}.tenant_id = :tenantId`, { tenantId: this.tenantId });

    if (this.companyId) {
      qb = qb.andWhere(`${alias}.company_id = :companyId`, {
        companyId: this.companyId,
      });
    }
    if (this.branchId) {
      qb = qb.andWhere(`${alias}.branch_id = :branchId`, {
        branchId: this.branchId,
      });
    }
    return qb;
  }
}
