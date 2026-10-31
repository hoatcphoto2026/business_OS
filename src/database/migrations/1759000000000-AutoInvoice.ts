import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoInvoice1759000000000 implements MigrationInterface {
  name = 'AutoInvoice1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auto_invoices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "invoice_number" varchar(50) NOT NULL,
        "trigger" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "subtotal" numeric(14,2) NOT NULL DEFAULT 0,
        "tax_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "discount_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "coupon_code" varchar(50),
        "total" numeric(14,2) NOT NULL DEFAULT 0,
        "error_message" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_auto_invoices" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_autoinv_tenant_status" ON "auto_invoices" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_autoinv_trigger" ON "auto_invoices" ("trigger")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auto_invoice_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "invoice_id" uuid NOT NULL,
        "description" varchar(255) NOT NULL,
        "quantity" numeric(10,2) NOT NULL DEFAULT 1,
        "unit_price" numeric(14,2) NOT NULL DEFAULT 0,
        "amount" numeric(14,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_auto_invoice_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_autoitem_invoice" FOREIGN KEY ("invoice_id")
          REFERENCES "auto_invoices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_autoitem_invoice" ON "auto_invoice_items" ("invoice_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auto_invoice_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auto_invoices"`);
  }
}
