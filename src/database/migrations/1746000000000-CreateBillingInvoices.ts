import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillingInvoices1746000000000 implements MigrationInterface {
  name = 'CreateBillingInvoices1746000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"        varchar(40) NOT NULL UNIQUE,
        "name"        varchar(100) NOT NULL,
        "type"        varchar(20) NOT NULL DEFAULT 'percent',
        "value"       numeric(14,2) NOT NULL DEFAULT 0,
        "is_active"   boolean NOT NULL DEFAULT true,
        "valid_from"  TIMESTAMPTZ,
        "valid_until" TIMESTAMPTZ,
        "max_uses"    int,
        "used_count"  int NOT NULL DEFAULT 0,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE "billing_invoices" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"        uuid NOT NULL,
        "invoice_number"   varchar(40) NOT NULL UNIQUE,
        "subscription_id"  uuid,
        "status"           varchar(30) NOT NULL DEFAULT 'DRAFT',
        "currency"         varchar(3) NOT NULL DEFAULT 'VND',
        "subtotal"         numeric(14,2) NOT NULL DEFAULT 0,
        "tax_rate"         numeric(5,2) NOT NULL DEFAULT 0,
        "tax_amount"       numeric(14,2) NOT NULL DEFAULT 0,
        "discount_amount"  numeric(14,2) NOT NULL DEFAULT 0,
        "coupon_code"      varchar(40),
        "total"            numeric(14,2) NOT NULL DEFAULT 0,
        "amount_paid"      numeric(14,2) NOT NULL DEFAULT 0,
        "issued_at"        TIMESTAMPTZ,
        "due_at"           TIMESTAMPTZ,
        "paid_at"          TIMESTAMPTZ,
        "voided_at"        TIMESTAMPTZ,
        "notes"            text,
        "created_by"       uuid,
        "updated_by"       uuid,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_billing_invoices_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_billing_invoices_tenant_status"
        ON "billing_invoices" ("tenant_id", "status");

      CREATE TABLE "billing_invoice_items" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "invoice_id"  uuid NOT NULL,
        "description" varchar(255) NOT NULL,
        "quantity"    int NOT NULL DEFAULT 1,
        "unit_price"  numeric(14,2) NOT NULL DEFAULT 0,
        "amount"      numeric(14,2) NOT NULL DEFAULT 0,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_billing_invoice_items_invoice"
          FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "billing_invoice_items";
      DROP TABLE IF EXISTS "billing_invoices";
      DROP TABLE IF EXISTS "coupons";
    `);
  }
}
