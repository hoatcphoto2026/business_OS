import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { Branch } from './entities/branch.entity';
import { Department } from './entities/department.entity';
import { UserCompany } from './entities/user-company.entity';
import { UserBranch } from './entities/user-branch.entity';
import { UserDepartment } from './entities/user-department.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(UserCompany)
    private readonly userCompanyRepo: Repository<UserCompany>,
    @InjectRepository(UserBranch)
    private readonly userBranchRepo: Repository<UserBranch>,
    @InjectRepository(UserDepartment)
    private readonly userDepartmentRepo: Repository<UserDepartment>,
    private readonly tenantContext: TenantContextService,
  ) {}

  private tenantId() {
    return this.tenantContext.getCurrentTenantId();
  }

  // ─── Companies ───────────────────────────────────────────────
  async findCompanies(): Promise<Company[]> {
    return this.companyRepo.find({
      where: { tenantId: this.tenantId() },
      order: { name: 'ASC' },
    });
  }

  async findCompanyById(id: string): Promise<Company> {
    const c = await this.companyRepo.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!c) throw new NotFoundException('Company not found');
    return c;
  }

  // ─── Branches ────────────────────────────────────────────────
  async findBranches(companyId?: string): Promise<Branch[]> {
    const where: any = { tenantId: this.tenantId() };
    if (companyId) where.companyId = companyId;
    return this.branchRepo.find({ where, order: { name: 'ASC' } });
  }

  // ─── Departments ─────────────────────────────────────────────
  async findDepartments(branchId?: string): Promise<Department[]> {
    const where: any = { tenantId: this.tenantId() };
    if (branchId) where.branchId = branchId;
    return this.departmentRepo.find({ where, order: { name: 'ASC' } });
  }

  // ─── User Assignments ────────────────────────────────────────
  async getUserCompanies(userId: string): Promise<UserCompany[]> {
    return this.userCompanyRepo.find({
      where: { userId },
      relations: ['company'],
    });
  }

  async getUserBranches(userId: string): Promise<UserBranch[]> {
    return this.userBranchRepo.find({
      where: { userId },
      relations: ['branch'],
    });
  }

  async getUserDepartments(userId: string): Promise<UserDepartment[]> {
    return this.userDepartmentRepo.find({
      where: { userId },
      relations: ['department'],
    });
  }

  /**
   * Resolve default organization context for a user after login.
   * Returns the first active assignment (or nulls if none).
   */
  async resolveDefaultContext(userId: string) {
    const companies = await this.getUserCompanies(userId);
    const branches = await this.getUserBranches(userId);
    const departments = await this.getUserDepartments(userId);

    return {
      companyId: companies[0]?.companyId ?? null,
      branchId: branches[0]?.branchId ?? null,
      departmentId: departments[0]?.departmentId ?? null,
    };
  }
}
