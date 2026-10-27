import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotent fix: convert sales_orders.status from the old
 * sales_order_status_enum to varchar so WorkflowStatus values
 * ('DRAFT', 'PENDING', ...) can be stored.
 *
 * Safe to run even if 1734000000000 already executed.
 */
export class FixSalesOrderStatusColumn1734100000000 implements MigrationInterface {
  name = 'FixSalesOrderStatusColumn1734100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Only alter if the column is still an enum
    const col = await queryRunner.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'sales_orders' AND column_name = 'status'
    `);

    if (col.length && col[0].udt_name === 'sales_order_status_enum') {
      await queryRunner.query(`
        ALTER TABLE "sales_orders"
          ALTER COLUMN "status" TYPE varchar(30)
          USING (
            CASE "status"::text
              WHEN 'draft'      THEN 'DRAFT'
              WHEN 'confirmed'  THEN 'APPROVED'
              WHEN 'shipped'    THEN 'POSTED'
              WHEN 'completed'  THEN 'CLOSED'
              WHEN 'cancelled'  THEN 'CANCELLED'
              ELSE UPPER("status"::text)
            END
          );
      `);

      await queryRunner.query(`
        ALTER TABLE "sales_orders"
          ALTER COLUMN "status" SET DEFAULT 'DRAFT';
      `);

      // Drop the old enum type if nothing else uses it
      await queryRunner.query(`
        DROP TYPE IF EXISTS "sales_order_status_enum";
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No automatic reverse – varchar is the desired state
  }
}
