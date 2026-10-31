/**
 * Purge e2e / test data from the database configured by .env (DB_NAME).
 *
 * Why: every e2e run creates tenants, users, audit logs, invoices, … and the
 * suites only close the Nest app – they never delete their rows. Without a
 * cleanup step the dev database keeps growing (100+ throw-away tenants) and
 * demo data / analytics get polluted.
 *
 * What is kept:
 * - Tenants in DEMO_TENANT_CODES (default: ABC,CAFE_MOC) and everything they own
 * - Users in DEMO_USER_EMAILS
 *
 * What is removed:
 * - All other tenants + every row that carries their tenant_id
 * - Users that only belonged to those tenants (no membership left)
 * - Test users created inside the demo tenants (e2e.*, audit.*, revoke.*, …)
 *
 * Safety:
 * - Dry-run by default. Nothing is deleted unless `--apply` is passed.
 * - Refuses to run when a demo tenant is missing (DB probably not seeded yet).
 * - Runs inside a single transaction.
 *
 * Usage:
 *   npm run db:purge-test-data            # show what would be deleted
 *   npm run db:purge-test-data:apply      # actually delete
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const APPLY = process.argv.includes('--apply');

const DEMO_TENANT_CODES = (process.env.DEMO_TENANT_CODES || 'ABC,CAFE_MOC')
  .split(',')
  .map((code) => code.trim())
  .filter(Boolean);

const DEMO_USER_EMAILS = (
  process.env.DEMO_USER_EMAILS ||
  [
    'admin@abctrading.vn',
    'hcm.user@abctrading.vn',
    'hanoi.user@abctrading.vn',
    'manager@abctrading.vn',
    'multi@businessos.vn',
    'owner@cafemoc.vn',
  ].join(',')
)
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);

/**
 * Emails produced by the e2e suites. Keep in sync with test/*.e2e-spec.ts.
 * `%@test.local`, `%@test.vn` and `%@example.com` cover onboarding / SSO
 * throw-away accounts. Demo emails are never matched by these patterns.
 */
const TEST_EMAIL_PATTERNS = [
  'e2e.%',
  'audit.%',
  'revoke.%',
  'limit-test-%',
  'sso-%',
  'sus-owner-%',
  'offboard.%',
  '%@test.local',
  '%@test.vn',
  '%@example.com',
];

interface TenantRow {
  id: string;
  code: string;
}

interface TableCount {
  table: string;
  rows: number;
}

function createDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'business_os',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false,
  });
}

async function listTenantTables(dataSource: DataSource): Promise<string[]> {
  const rows: Array<{ table_name: string }> = await dataSource.query(`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  `);
  return rows.map((row) => row.table_name);
}


async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();

  try {
    console.log(
      `\n▶ Target database: ${process.env.DB_NAME || 'business_os'} @ ` +
        `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}`,
    );
    console.log(`   Demo tenants kept : ${DEMO_TENANT_CODES.join(', ')}`);
    console.log(
      `   Mode              : ${APPLY ? 'APPLY (delete)' : 'DRY-RUN (no changes)'}\n`,
    );

    const tenants: TenantRow[] = await dataSource.query(
      'SELECT id, code FROM tenants ORDER BY code',
    );
    const demoTenants = tenants.filter((t) =>
      DEMO_TENANT_CODES.includes(t.code),
    );
    const removableTenants = tenants.filter(
      (t) => !DEMO_TENANT_CODES.includes(t.code),
    );

    const missingDemoTenants = DEMO_TENANT_CODES.filter(
      (code) => !demoTenants.some((t) => t.code === code),
    );
    if (missingDemoTenants.length > 0) {
      throw new Error(
        `Refusing to purge: demo tenant(s) not found: ` +
          `${missingDemoTenants.join(', ')}. Run "npm run seed" first.`,
      );
    }

    const removableTenantIds = removableTenants.map((t) => t.id);
    const tenantTables = await listTenantTables(dataSource);

    const tableCounts: TableCount[] = [];
    for (const table of tenantTables) {
      if (removableTenantIds.length === 0) break;
      const [row] = await dataSource.query(
        `SELECT COUNT(*)::int AS rows FROM "${table}" WHERE tenant_id = ANY($1::uuid[])`,
        [removableTenantIds],
      );
      if (row.rows > 0) {
        tableCounts.push({ table, rows: row.rows });
      }
    }

    const membersOfRemovedTenants: Array<{ user_id: string }> =
      removableTenantIds.length > 0
        ? await dataSource.query(
            'SELECT DISTINCT user_id FROM tenant_users WHERE tenant_id = ANY($1::uuid[])',
            [removableTenantIds],
          )
        : [];

    const testUsers: Array<{ id: string; email: string }> =
      await dataSource.query(
        'SELECT id, email FROM users WHERE email LIKE ANY($1::text[]) ORDER BY email',
        [TEST_EMAIL_PATTERNS],
      );

    const totalTenantRows = tableCounts.reduce((sum, t) => sum + t.rows, 0);

    console.log(`Tenants total          : ${tenants.length}`);
    console.log(`Tenants to delete      : ${removableTenants.length}`);
    console.log(`Tenant-scoped rows     : ${totalTenantRows}`);
    console.log(
      `Users only in removed  : ${membersOfRemovedTenants.length} (candidate orphans)`,
    );
    console.log(`Test users by pattern  : ${testUsers.length}`);

    if (tableCounts.length > 0) {
      console.log('\nRows per table (top 20):');
      tableCounts
        .sort((a, b) => b.rows - a.rows)
        .slice(0, 20)
        .forEach(({ table, rows }) => {
          console.log(`  ${table.padEnd(34)} ${rows}`);
        });
      if (tableCounts.length > 20) {
        console.log(`  … and ${tableCounts.length - 20} more tables`);
      }
    }

    const sampleTenants = removableTenants
      .slice(0, 10)
      .map((t) => t.code)
      .join(', ');
    if (sampleTenants) {
      console.log(
        `\nSample tenants to delete: ${sampleTenants}${
          removableTenants.length > 10 ? ', …' : ''
        }`,
      );
    }

    if (!APPLY) {
      const changed =
        removableTenants.length > 0 ||
        totalTenantRows > 0 ||
        testUsers.length > 0;
      console.log(
        changed
          ? '\nDRY-RUN only. Re-run with "npm run db:purge-test-data:apply" to delete.\n'
          : '\nNothing to purge – database is already clean.\n',
      );
      return;
    }

    await dataSource.transaction(async (manager) => {
      // 1) Tenant-scoped rows. Most tables cascade from `tenants`, but many
      //    later migrations created tenant_id without a FK, so delete explicitly.
      for (const table of tenantTables) {
        if (removableTenantIds.length === 0) break;
        await manager.query(
          `DELETE FROM "${table}" WHERE tenant_id = ANY($1::uuid[])`,
          [removableTenantIds],
        );
      }

      // 2) The tenants themselves (cascades anything still attached).
      if (removableTenantIds.length > 0) {
        await manager.query(
          'DELETE FROM tenants WHERE id = ANY($1::uuid[])',
          [removableTenantIds],
        );
      }

      // 3) Users that only existed inside the removed tenants.
      const orphanCandidates = membersOfRemovedTenants.map((m) => m.user_id);
      if (orphanCandidates.length > 0) {
        await manager.query(
          `DELETE FROM users
             WHERE id = ANY($1::uuid[])
               AND email <> ALL($2::text[])
               AND NOT EXISTS (
                 SELECT 1 FROM tenant_users tu WHERE tu.user_id = users.id
               )`,
          [orphanCandidates, DEMO_USER_EMAILS],
        );
      }

      // 4) Test users left inside the demo tenants.
      if (testUsers.length > 0) {
        const testUserIds = testUsers.map((u) => u.id);
        await manager.query(
          'DELETE FROM tenant_users WHERE user_id = ANY($1::uuid[])',
          [testUserIds],
        );
        await manager.query(
          'DELETE FROM users WHERE id = ANY($1::uuid[]) AND email <> ALL($2::text[])',
          [testUserIds, DEMO_USER_EMAILS],
        );
      }
    });

    const [after] = await dataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM tenants) AS tenants,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM tenant_users) AS memberships
    `);

    console.log('\n✅ Purge completed');
    console.log(
      `   Remaining: ${after.tenants} tenants, ${after.users} users, ` +
        `${after.memberships} memberships`,
    );

    const demoState: Array<{
      code: string;
      tenant_status: string;
      membership_status: string;
    }> = await dataSource.query(
      `SELECT t.code,
              t.status AS tenant_status,
              tu.status AS membership_status
         FROM tenants t
         JOIN tenant_users tu ON tu.tenant_id = t.id
         JOIN users u ON u.id = tu.user_id
        WHERE u.email = ANY($1::text[])
        ORDER BY t.code, u.email`,
      [DEMO_USER_EMAILS],
    );
    console.log('   Demo memberships:');
    demoState.forEach((row) => {
      console.log(
        `     ${row.code.padEnd(10)} tenant=${row.tenant_status.padEnd(8)} ` +
          `membership=${row.membership_status}`,
      );
    });
    console.log(
      '\nTip: run "npm run seed" if you also want subscriptions/plans reset to baseline.\n',
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`\n❌ Purge failed: ${error.message ?? error}\n`);
  process.exit(1);
});

