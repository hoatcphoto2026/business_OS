/**
 * One-shot: add missing owner_id columns so seed can run.
 * Usage: npx ts-node -r tsconfig-paths/register src/database/fix-owner-columns.ts
 */
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'business_os',
  });
  await ds.initialize();

  const tables = [
    'customers',
    'products',
    'sales_orders',
    'invoices',
    'payments',
    'inventory_transactions',
  ];

  for (const table of tables) {
    await ds.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "owner_id" uuid`);
    await ds.query(
      `CREATE INDEX IF NOT EXISTS "IDX_${table}_owner" ON "${table}" ("owner_id")`,
    );
    const cols = await ds.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [table],
    );
    console.log(
      `${table}:`,
      cols.map((c: { column_name: string }) => c.column_name).join(', '),
    );
  }

  await ds.destroy();
  console.log('Done. Now run: npm run seed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
