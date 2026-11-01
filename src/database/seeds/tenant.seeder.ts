import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  Tenant,
  TenantPlan,
  TenantStatus,
} from '../../modules/tenant/entities/tenant.entity';
import {
  TenantUser,
  MembershipStatus,
} from '../../modules/tenant/entities/tenant-user.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { Product } from '../../modules/products/entities/product.entity';
import { SalesOrder } from '../../modules/sales-orders/entities/sales-order.entity';
import { WorkflowStatus } from '../../modules/workflow/enums/workflow-status.enum';

/**
 * Seeds:
 * - Tenant ABC Trading (slug: abc-trading)
 * - Tenant Cafe Mộc   (slug: cafe-moc)
 * - Users with memberships
 * - Shared multi-tenant user (belongs to BOTH tenants) for CASE 6
 * - Customers / Products / Orders per tenant
 */
export async function seedTenants(dataSource: DataSource): Promise<void> {
  // DB cũ có thể thiếu owner_id vì migration scope đã được đánh dấu chạy
  // trước khi entity Product map cột này. Thêm idempotent trước khi query.
  const scopeTables = [
    'customers',
    'products',
    'sales_orders',
    'invoices',
    'payments',
    'inventory_transactions',
  ];
  for (const table of scopeTables) {
    await dataSource.query(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "owner_id" uuid`,
    );
    await dataSource.query(
      `CREATE INDEX IF NOT EXISTS "IDX_${table}_owner" ON "${table}" ("owner_id")`,
    );
  }
  const productCols = await dataSource.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' ORDER BY ordinal_position`,
  );
  console.log(
    'products columns:',
    productCols.map((c: { column_name: string }) => c.column_name).join(', '),
  );

  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);
  const membershipRepo = dataSource.getRepository(TenantUser);
  const customerRepo = dataSource.getRepository(Customer);
  const productRepo = dataSource.getRepository(Product);
  const orderRepo = dataSource.getRepository(SalesOrder);

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // ─── Tenants ─────────────────────────────────────────────────
  async function ensureTenant(
    code: string,
    slug: string,
    name: string,
    plan: TenantPlan,
  ) {
    let t = await tenantRepo.findOne({ where: { code } });
    if (!t) {
      t = tenantRepo.create({
        code,
        slug,
        name,
        plan,
        status: TenantStatus.ACTIVE,
        settings: {
          timezone: 'Asia/Ho_Chi_Minh',
          currency: 'VND',
          language: 'vi',
          country: 'VN',
          source: 'direct',
          dateFormat: 'dd/MM/yyyy',
          businessMode: true,
          accountingMode: false,
        },
      });
      t = await tenantRepo.save(t);
    } else if (t.status !== TenantStatus.ACTIVE && t.status !== TenantStatus.TRIAL) {
      // Reset status so login works after previous test runs
      t.status = TenantStatus.ACTIVE;
      t = await tenantRepo.save(t);
    }

    // Idempotent backfill for databases seeded before `country` existed.
    const settings = t.settings ?? {};
    if (!settings.country || !settings.source) {
      t.settings = {
        ...settings,
        country: settings.country ?? 'VN',
        source: settings.source ?? 'direct',
      };
      t = await tenantRepo.save(t);
    }
    return t;
  }

  const tenantA = await ensureTenant(
    'ABC',
    'abc-trading',
    'ABC Trading',
    TenantPlan.PROFESSIONAL,
  );
  const tenantB = await ensureTenant(
    'CAFE_MOC',
    'cafe-moc',
    'Cafe Mộc',
    TenantPlan.STARTER,
  );

  // ─── Users (global) ──────────────────────────────────────────
  async function ensureUser(email: string, fullName: string) {
    let u = await userRepo.findOne({ where: { email } });
    if (!u) {
      u = userRepo.create({
        email,
        passwordHash,
        fullName,
        isActive: true,
      });
      u = await userRepo.save(u);
    }
    return u;
  }

  const userA = await ensureUser('admin@abctrading.vn', 'Nguyễn Văn A');
  const userB = await ensureUser('owner@cafemoc.vn', 'Trần Thị B');
  // Multi-tenant user for CASE 6
  const userMulti = await ensureUser('multi@businessos.vn', 'Lê Văn Multi');

  // ─── Memberships ─────────────────────────────────────────────
  async function ensureMembership(
    tenantId: string,
    userId: string,
    role: string,
  ) {
    let m = await membershipRepo.findOne({ where: { tenantId, userId } });
    if (!m) {
      m = membershipRepo.create({
        tenantId,
        userId,
        role,
        status: MembershipStatus.ACTIVE,
      });
      m = await membershipRepo.save(m);
    } else if (m.status !== MembershipStatus.ACTIVE) {
      // Idempotent recovery: previous e2e (offboarding) may have suspended memberships
      m.status = MembershipStatus.ACTIVE;
      m = await membershipRepo.save(m);
    }
    return m;
  }

  await ensureMembership(tenantA.id, userA.id, 'admin');
  await ensureMembership(tenantB.id, userB.id, 'admin');
  // Multi user belongs to BOTH
  await ensureMembership(tenantA.id, userMulti.id, 'member');
  await ensureMembership(tenantB.id, userMulti.id, 'member');

  // ─── Customers ───────────────────────────────────────────────
  async function ensureCustomer(
    tenantId: string,
    name: string,
    code: string,
    createdBy: string,
  ) {
    let c = await customerRepo.findOne({ where: { tenantId, code } });
    if (!c) {
      c = customerRepo.create({
        tenantId,
        name,
        code,
        status: 'active',
        createdBy,
        updatedBy: createdBy,
        ownerId: createdBy,
      });
      c = await customerRepo.save(c);
    }
    return c;
  }

  const custA1 = await ensureCustomer(
    tenantA.id,
    'Khách hàng ABC 1',
    'KH-ABC-001',
    userA.id,
  );
  const custA2 = await ensureCustomer(
    tenantA.id,
    'Khách hàng ABC 2',
    'KH-ABC-002',
    userA.id,
  );
  const custB1 = await ensureCustomer(
    tenantB.id,
    'Khách Cafe Mộc 1',
    'KH-CM-001',
    userB.id,
  );

  // ─── Products ────────────────────────────────────────────────
  async function ensureProduct(
    tenantId: string,
    sku: string,
    name: string,
    price: number,
    createdBy: string,
  ) {
    let p = await productRepo.findOne({ where: { tenantId, sku } });
    if (!p) {
      p = productRepo.create({
        tenantId,
        sku,
        name,
        unitPrice: price,
        unit: 'pcs',
        active: true,
        createdBy,
        updatedBy: createdBy,
        ownerId: createdBy,
      });
      p = await productRepo.save(p);
    }
    return p;
  }

  await ensureProduct(tenantA.id, 'ABC-SKU-001', 'Sản phẩm ABC 1', 150000, userA.id);
  await ensureProduct(tenantA.id, 'ABC-SKU-002', 'Sản phẩm ABC 2', 250000, userA.id);
  await ensureProduct(tenantB.id, 'CM-SKU-001', 'Cà phê Arabica', 120000, userB.id);
  await ensureProduct(tenantB.id, 'CM-SKU-002', 'Cà phê Robusta', 90000, userB.id);

  // ─── Sales Orders ────────────────────────────────────────────
  async function ensureOrder(
    tenantId: string,
    orderNumber: string,
    customerId: string,
    amount: number,
    createdBy: string,
  ) {
    let o = await orderRepo.findOne({ where: { tenantId, orderNumber } });
    if (!o) {
      o = orderRepo.create({
        tenantId,
        orderNumber,
        customerId,
        status: WorkflowStatus.APPROVED,
        orderDate: new Date().toISOString().slice(0, 10),
        totalAmount: amount,
        createdBy,
        updatedBy: createdBy,
        ownerId: createdBy,
      });
      o = await orderRepo.save(o);
    }
    return o;
  }

  await ensureOrder(tenantA.id, 'SO-ABC-001', custA1.id, 1500000, userA.id);
  await ensureOrder(tenantA.id, 'SO-ABC-002', custA2.id, 3200000, userA.id);
  await ensureOrder(tenantB.id, 'SO-CM-001', custB1.id, 450000, userB.id);

  console.log('✅ Seed completed:');
  console.log(`   Tenant A: ABC Trading  (slug=abc-trading) id=${tenantA.id}`);
  console.log(`   Tenant B: Cafe Mộc     (slug=cafe-moc)    id=${tenantB.id}`);
  console.log(`   User A:   admin@abctrading.vn  → ABC only`);
  console.log(`   User B:   owner@cafemoc.vn     → Cafe Mộc only`);
  console.log(`   User Multi: multi@businessos.vn → BOTH tenants (CASE 6)`);
  console.log('   Password for all users: Password123!');
}
