import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotent backfill: ensure owner_id exists on all scope-aware tables.
 *
 * Needed when CreateScopeAndTeams was already recorded as executed
 * before products (or other tables) were included in that migration.
 */
export class EnsureOwnerIdColumns1733100000000 implements MigrationInterface {
  name = 'EnsureOwnerIdColumns1733100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'customers',
      'products',
      'sales_orders',
      'invoices',
      'payments',
      'inventory_transactions',
    ];

    for (const table of tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "owner_id" uuid;
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_owner" ON "${table}" ("owner_id");
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally no-op: owner_id is part of the scope model.
  }
}
