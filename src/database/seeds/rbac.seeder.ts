import { DataSource } from 'typeorm';
import { Permission } from '../../modules/rbac/entities/permission.entity';
import { Role } from '../../modules/rbac/entities/role.entity';
import { RolePermission } from '../../modules/rbac/entities/role-permission.entity';
import { UserRole } from '../../modules/rbac/entities/user-role.entity';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';
import { User } from '../../modules/users/entities/user.entity';

const PERMISSIONS = [
  { module: 'customer', action: 'view', code: 'customer.view' },
  { module: 'customer', action: 'create', code: 'customer.create' },
  { module: 'customer', action: 'update', code: 'customer.update' },
  { module: 'customer', action: 'delete', code: 'customer.delete' },
  { module: 'sales', action: 'view', code: 'sales.view' },
  { module: 'sales', action: 'create', code: 'sales.create' },
  { module: 'sales', action: 'update', code: 'sales.update' },
  { module: 'sales', action: 'approve', code: 'sales.approve' },
  { module: 'sales', action: 'delete', code: 'sales.delete' },
  { module: 'product', action: 'view', code: 'product.view' },
  { module: 'product', action: 'create', code: 'product.create' },
  { module: 'product', action: 'update', code: 'product.update' },
  { module: 'product', action: 'delete', code: 'product.delete' },
  { module: 'audit', action: 'view', code: 'audit.view' },
  { module: 'feature', action: 'manage', code: 'feature.manage' },
  { module: 'inventory', action: 'view', code: 'inventory.view' },
  { module: 'inventory', action: 'update', code: 'inventory.update' },
  { module: 'invoice', action: 'issue', code: 'invoice.issue' },
  { module: 'profit', action: 'view', code: 'profit.view' },
  { module: 'bank', action: 'view', code: 'bank.view' },
  { module: 'admin', action: 'access', code: 'admin.access' },
  { module: 'billing', action: 'view', code: 'billing.view' },
  { module: 'billing', action: 'manage', code: 'billing.manage' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: PERMISSIONS.map((p) => p.code),
  admin: PERMISSIONS.map((p) => p.code),
  manager: [
    'customer.view', 'customer.create', 'customer.update', 'customer.delete',
    'sales.view', 'sales.create', 'sales.update', 'sales.approve',
    'product.view', 'product.create', 'product.update',
    'inventory.view', 'inventory.update',
    'invoice.issue',
    'profit.view',
    'audit.view',
    'billing.view',
  ],
  sales: [
    'customer.view', 'customer.create', 'customer.update', 'customer.delete',
    'sales.view', 'sales.create',
    'audit.view',
  ],
  cashier: ['sales.view', 'sales.create', 'invoice.issue'],
  warehouse: ['inventory.view', 'inventory.update'],
  accountant: ['profit.view', 'tax.view', 'bank.view', 'invoice.issue'],
  auditor: ['profit.view', 'tax.view', 'bank.view', 'customer.view', 'sales.view', 'audit.view'],
};

export async function seedRbac(dataSource: DataSource): Promise<void> {
  const permRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);
  const rpRepo = dataSource.getRepository(RolePermission);
  const urRepo = dataSource.getRepository(UserRole);
  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);

  // Seed permissions
  for (const p of PERMISSIONS) {
    const exists = await permRepo.findOne({ where: { code: p.code } });
    if (!exists) {
      await permRepo.save(permRepo.create(p));
    }
  }

  const tenant = await tenantRepo.findOne({ where: { code: 'ABC' } });
  if (!tenant) {
    console.log('⚠️  ABC tenant not found, skip role seeding');
    return;
  }

  // Seed roles
  for (const [code, perms] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await roleRepo.findOne({ where: { tenantId: tenant.id, code } });
    if (!role) {
      role = await roleRepo.save(
        roleRepo.create({
          tenantId: tenant.id,
          code,
          name: code.charAt(0).toUpperCase() + code.slice(1),
          status: 'active',
        }),
      );
    }

    // Assign permissions
    for (const permCode of perms) {
      const perm = await permRepo.findOne({ where: { code: permCode } });
      if (!perm) continue;

      const exists = await rpRepo.findOne({
        where: { roleId: role.id, permissionId: perm.id },
      });
      if (!exists) {
        await rpRepo.save(rpRepo.create({ roleId: role.id, permissionId: perm.id }));
      }
    }
  }

  // Assign roles to demo users
  const userHCM = await userRepo.findOne({ where: { email: 'hcm.user@abctrading.vn' } });
  const userHN = await userRepo.findOne({ where: { email: 'hanoi.user@abctrading.vn' } });
  const userMgr = await userRepo.findOne({ where: { email: 'manager@abctrading.vn' } });
  const userAdmin = await userRepo.findOne({ where: { email: 'admin@abctrading.vn' } });

  const salesRole = await roleRepo.findOne({ where: { tenantId: tenant.id, code: 'sales' } });
  const managerRole = await roleRepo.findOne({ where: { tenantId: tenant.id, code: 'manager' } });
  const adminRole = await roleRepo.findOne({ where: { tenantId: tenant.id, code: 'admin' } });

  async function assign(user: User | null, role: Role | null) {
    if (!user || !role) return;
    const exists = await urRepo.findOne({ where: { userId: user.id, roleId: role.id } });
    if (!exists) {
      await urRepo.save(urRepo.create({ userId: user.id, roleId: role.id }));
    }
  }

  await assign(userHCM, salesRole);
  await assign(userHN, salesRole); // sales has customer.view so org-isolation can test data scope
  await assign(userMgr, managerRole);
  await assign(userAdmin, adminRole);

  // Multi-tenant user needs customer.view on both tenants for isolation switch test
  const userMulti = await userRepo.findOne({ where: { email: 'multi@businessos.vn' } });
  if (userMulti && salesRole) {
    await assign(userMulti, salesRole);
  }

  // Cafe Mộc admin — needed so cross-tenant audit tests have a real second tenant.
  const tenantB = await tenantRepo.findOne({ where: { code: 'CAFE_MOC' } });
  const cafeOwner = await userRepo.findOne({ where: { email: 'owner@cafemoc.vn' } });
  if (tenantB && cafeOwner) {
    let cafeAdmin = await roleRepo.findOne({ where: { tenantId: tenantB.id, code: 'admin' } });
    if (!cafeAdmin) {
      cafeAdmin = await roleRepo.save(
        roleRepo.create({
          tenantId: tenantB.id,
          code: 'admin',
          name: 'Admin',
          status: 'active',
        }),
      );
    }
    for (const permCode of ROLE_PERMISSIONS.admin) {
      const perm = await permRepo.findOne({ where: { code: permCode } });
      if (!perm) continue;
      const exists = await rpRepo.findOne({
        where: { roleId: cafeAdmin.id, permissionId: perm.id },
      });
      if (!exists) {
        await rpRepo.save(rpRepo.create({ roleId: cafeAdmin.id, permissionId: perm.id }));
      }
    }
    await assign(cafeOwner, cafeAdmin);

    // Give multi user a sales role on Cafe Mộc so switch + customer.view works
    const userMulti = await userRepo.findOne({ where: { email: 'multi@businessos.vn' } });
    if (userMulti) {
      let cafeSales = await roleRepo.findOne({ where: { tenantId: tenantB.id, code: 'sales' } });
      if (!cafeSales) {
        cafeSales = await roleRepo.save(
          roleRepo.create({ tenantId: tenantB.id, code: 'sales', name: 'Sales', status: 'active' }),
        );
        for (const permCode of ROLE_PERMISSIONS.sales) {
          const perm = await permRepo.findOne({ where: { code: permCode } });
          if (!perm) continue;
          const exists = await rpRepo.findOne({ where: { roleId: cafeSales.id, permissionId: perm.id } });
          if (!exists) {
            await rpRepo.save(rpRepo.create({ roleId: cafeSales.id, permissionId: perm.id }));
          }
        }
      }
      await assign(userMulti, cafeSales);
    }
  }

  console.log('✅ RBAC seeder completed');
  console.log('   Roles: owner, admin, manager, sales, cashier, warehouse, accountant, auditor');
  console.log('   Demo assignments:');
  console.log('     hcm.user      → sales');
  console.log('     hanoi.user    → sales (for org isolation)');
  console.log('     manager       → manager');
  console.log('     admin         → admin');
  console.log('     multi         → sales (ABC + Cafe Mộc)');
  console.log('     owner@cafemoc → admin (Cafe Mộc)');
}
