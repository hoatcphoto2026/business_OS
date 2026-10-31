import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant, TenantStatus, TenantPlan } from '../../modules/tenant/entities/tenant.entity';
import { User } from '../../modules/users/entities/user.entity';
import { TenantUser, MembershipStatus } from '../../modules/tenant/entities/tenant-user.entity';
import { Company, OrgStatus } from '../../modules/organization/entities/company.entity';
import { Branch } from '../../modules/organization/entities/branch.entity';
import { Department } from '../../modules/organization/entities/department.entity';
import { UserCompany } from '../../modules/organization/entities/user-company.entity';
import { UserBranch } from '../../modules/organization/entities/user-branch.entity';
import { UserDepartment } from '../../modules/organization/entities/user-department.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';

/**
 * Sprint 2 Organization Seeder
 *
 * Creates demo structure:
 * ABC Group (Tenant)
 * └── ABC Trading (Company)
 *     ├── HCM Branch
 *     │   ├── Sales
 *     │   ├── Warehouse
 *     │   └── Accounting
 *     └── Hanoi Branch
 *         ├── Sales
 *         └── Warehouse
 *
 * Users:
 * - hcm.user@abctrading.vn     → HCM Branch only
 * - hanoi.user@abctrading.vn   → Hanoi Branch only
 * - manager@abctrading.vn      → Company level (all branches)
 */
export async function seedOrganization(dataSource: DataSource): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);
  const membershipRepo = dataSource.getRepository(TenantUser);
  const companyRepo = dataSource.getRepository(Company);
  const branchRepo = dataSource.getRepository(Branch);
  const deptRepo = dataSource.getRepository(Department);
  const userCompanyRepo = dataSource.getRepository(UserCompany);
  const userBranchRepo = dataSource.getRepository(UserBranch);
  const userDeptRepo = dataSource.getRepository(UserDepartment);
  const customerRepo = dataSource.getRepository(Customer);

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Ensure ABC tenant exists (from Sprint 1 seeder or create)
  let tenant = await tenantRepo.findOne({ where: { code: 'ABC' } });
  if (!tenant) {
    tenant = tenantRepo.create({
      code: 'ABC',
      slug: 'abc-trading',
      name: 'ABC Trading',
      plan: TenantPlan.PROFESSIONAL,
      status: TenantStatus.ACTIVE,
      settings: { timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' },
    });
    tenant = await tenantRepo.save(tenant);
  }

  // Company
  let company = await companyRepo.findOne({ where: { tenantId: tenant.id, code: 'ABC_TRADING' } });
  if (!company) {
    company = companyRepo.create({
      tenantId: tenant.id,
      code: 'ABC_TRADING',
      name: 'ABC Trading',
      taxCode: '0312345678',
      status: OrgStatus.ACTIVE,
    });
    company = await companyRepo.save(company);
  }

  // Branches
  async function ensureBranch(code: string, name: string) {
    let b = await branchRepo.findOne({ where: { tenantId: tenant!.id, companyId: company!.id, code } });
    if (!b) {
      b = branchRepo.create({
        tenantId: tenant!.id,
        companyId: company!.id,
        code,
        name,
        status: OrgStatus.ACTIVE,
      });
      b = await branchRepo.save(b);
    }
    return b;
  }

  const branchHCM = await ensureBranch('HCM', 'HCM Branch');
  const branchHN = await ensureBranch('HANOI', 'Hanoi Branch');

  // Departments
  async function ensureDept(branch: Branch, code: string, name: string) {
    let d = await deptRepo.findOne({ where: { tenantId: tenant!.id, branchId: branch.id, code } });
    if (!d) {
      d = deptRepo.create({
        tenantId: tenant!.id,
        companyId: company!.id,
        branchId: branch.id,
        code,
        name,
        status: OrgStatus.ACTIVE,
      });
      d = await deptRepo.save(d);
    }
    return d;
  }

  const deptSalesHCM = await ensureDept(branchHCM, 'SALES', 'Sales');
  const deptWhHCM = await ensureDept(branchHCM, 'WAREHOUSE', 'Warehouse');
  const deptAccHCM = await ensureDept(branchHCM, 'ACCOUNTING', 'Accounting');
  const deptSalesHN = await ensureDept(branchHN, 'SALES', 'Sales');
  const deptWhHN = await ensureDept(branchHN, 'WAREHOUSE', 'Warehouse');

  // Users
  async function ensureUser(email: string, fullName: string) {
    let u = await userRepo.findOne({ where: { email } });
    if (!u) {
      u = userRepo.create({ email, passwordHash, fullName, isActive: true });
      u = await userRepo.save(u);
    }
    return u;
  }

  const userHCM = await ensureUser('hcm.user@abctrading.vn', 'Nguyễn Văn HCM');
  const userHN = await ensureUser('hanoi.user@abctrading.vn', 'Trần Thị Hanoi');
  const userMgr = await ensureUser('manager@abctrading.vn', 'Lê Văn Manager');

  // Memberships
  async function ensureMembership(user: User, role: string) {
    let m = await membershipRepo.findOne({ where: { tenantId: tenant!.id, userId: user.id } });
    if (!m) {
      m = membershipRepo.create({
        tenantId: tenant!.id,
        userId: user.id,
        role,
        status: MembershipStatus.ACTIVE,
      });
      m = await membershipRepo.save(m);
    } else if (m.status !== MembershipStatus.ACTIVE) {
      // Force active for demo users (previous offboarding/tests may have suspended them)
      m.status = MembershipStatus.ACTIVE;
      m = await membershipRepo.save(m);
    }
    return m;
  }

  await ensureMembership(userHCM, 'member');
  await ensureMembership(userHN, 'member');
  await ensureMembership(userMgr, 'admin');

  // User assignments
  async function assignCompany(user: User) {
    const exists = await userCompanyRepo.findOne({ where: { userId: user.id, companyId: company!.id } });
    if (!exists) {
      await userCompanyRepo.save(userCompanyRepo.create({ userId: user.id, companyId: company!.id }));
    }
  }

  async function assignBranch(user: User, branch: Branch) {
    const exists = await userBranchRepo.findOne({ where: { userId: user.id, branchId: branch.id } });
    if (!exists) {
      await userBranchRepo.save(userBranchRepo.create({ userId: user.id, branchId: branch.id }));
    }
  }

  await assignCompany(userHCM);
  await assignCompany(userHN);
  await assignCompany(userMgr);

  await assignBranch(userHCM, branchHCM);
  await assignBranch(userHN, branchHN);
  // Manager has no specific branch → company-level access

  // Demo customers per branch
  async function ensureCustomer(name: string, branch: Branch) {
    const exists = await customerRepo.findOne({
      where: { tenantId: tenant!.id, companyId: company!.id, branchId: branch.id, name },
    });
    if (!exists) {
      await customerRepo.save(
        customerRepo.create({
          tenantId: tenant!.id,
          companyId: company!.id,
          branchId: branch.id,
          name,
          code: name.substring(0, 8).toUpperCase(),
          status: 'active',
        }),
      );
    }
  }

  await ensureCustomer('Khách HCM 1', branchHCM);
  await ensureCustomer('Khách HCM 2', branchHCM);
  await ensureCustomer('Khách Hanoi 1', branchHN);

  console.log('✅ Organization seeder completed');
  console.log(`   Company: ${company.name} (${company.id})`);
  console.log(`   HCM Branch: ${branchHCM.id}`);
  console.log(`   Hanoi Branch: ${branchHN.id}`);
  console.log(`   Users: hcm.user / hanoi.user / manager`);
}
