import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 1 – Multi-Tenant Foundation (revised)
 *
 * Key design decisions:
 * - users is GLOBAL (no tenant_id)
 * - tenant_users is the membership junction (user ↔ many tenants)
 * - tenants has slug for subdomain/path routing
 * - BaseTenantEntity fields (tenant_id, created_by, updated_by) on all business tables
 */
export class CreateMultiTenantFoundation1729750000000
  implements MigrationInterface
{
  name = 'CreateMultiTenantFoundation1729750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── enums ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "tenant_plan_enum" AS ENUM ('free', 'starter', 'professional', 'enterprise');
    `);
    await queryRunner.query(`
      CREATE TYPE "tenant_status_enum" AS ENUM ('trial', 'active', 'suspended', 'past_due', 'closed');
    `);
    await queryRunner.query(`
      CREATE TYPE "membership_status_enum" AS ENUM ('active', 'invited', 'suspended', 'left');
    `);
    await queryRunner.query(`
      CREATE TYPE "sales_order_status_enum" AS ENUM ('draft', 'confirmed', 'shipped', 'completed', 'cancelled');
    `);

    // ─── tenants ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"        varchar(50)  NOT NULL,
        "slug"        varchar(100) NOT NULL,
        "name"        varchar(255) NOT NULL,
        "plan"        "tenant_plan_enum" NOT NULL DEFAULT 'starter',
        "status"      "tenant_status_enum" NOT NULL DEFAULT 'trial',
        "settings"    jsonb NOT NULL DEFAULT '{}',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_tenants_code" UNIQUE ("code"),
        CONSTRAINT "UQ_tenants_slug" UNIQUE ("slug")
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_tenants_status" ON "tenants" ("status");`);

    // ─── users (GLOBAL – no tenant_id) ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email"         varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "full_name"     varchar(255) NOT NULL,
        "is_active"     boolean NOT NULL DEFAULT true,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email");`);

    // ─── tenant_users (membership) ─────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tenant_users" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "user_id"     uuid NOT NULL,
        "role"        varchar(50) NOT NULL DEFAULT 'member',
        "status"      "membership_status_enum" NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_tenant_users_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_users_user"   FOREIGN KEY ("user_id")   REFERENCES "users"("id")   ON DELETE CASCADE,
        CONSTRAINT "UQ_tenant_users_tenant_user" UNIQUE ("tenant_id", "user_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_tenant_users_tenant_id" ON "tenant_users" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_tenant_users_user_id"   ON "tenant_users" ("user_id");`);

    // ─── customers ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "created_by"  uuid,
        "updated_by"  uuid,
        "name"        varchar(255) NOT NULL,
        "code"        varchar(50),
        "email"       varchar(255),
        "phone"       varchar(30),
        "address"     text,
        "status"      varchar(50) NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_customers_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_customers_tenant_id" ON "customers" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_customers_code" ON "customers" ("code");`);

    // ─── products ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "created_by"  uuid,
        "updated_by"  uuid,
        "sku"         varchar(100) NOT NULL,
        "name"        varchar(255) NOT NULL,
        "description" text,
        "unit_price"  decimal(18,2) NOT NULL DEFAULT 0,
        "unit"        varchar(30) NOT NULL DEFAULT 'pcs',
        "active"      boolean NOT NULL DEFAULT true,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_products_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_products_tenant_id" ON "products" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_products_sku" ON "products" ("sku");`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_tenant_sku" ON "products" ("tenant_id", "sku");
    `);

    // ─── sales_orders ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "sales_orders" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"     uuid NOT NULL,
        "created_by"    uuid,
        "updated_by"    uuid,
        "order_number"  varchar(50) NOT NULL,
        "customer_id"   uuid NOT NULL,
        "status"        "sales_order_status_enum" NOT NULL DEFAULT 'draft',
        "order_date"    date NOT NULL,
        "total_amount"  decimal(18,2) NOT NULL DEFAULT 0,
        "notes"         text,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_sales_orders_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sales_orders_tenant_id" ON "sales_orders" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_orders_order_number" ON "sales_orders" ("order_number");`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_sales_orders_tenant_number" ON "sales_orders" ("tenant_id", "order_number");
    `);

    // ─── invoices ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"       uuid NOT NULL,
        "created_by"      uuid,
        "updated_by"      uuid,
        "invoice_number"  varchar(50) NOT NULL,
        "customer_id"     uuid NOT NULL,
        "sales_order_id"  uuid,
        "issue_date"      date NOT NULL,
        "due_date"        date,
        "total_amount"    decimal(18,2) NOT NULL DEFAULT 0,
        "tax_amount"      decimal(18,2) NOT NULL DEFAULT 0,
        "status"          varchar(30) NOT NULL DEFAULT 'draft',
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_invoices_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_tenant_id" ON "invoices" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_invoice_number" ON "invoices" ("invoice_number");`);

    // ─── payments ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"       uuid NOT NULL,
        "created_by"      uuid,
        "updated_by"      uuid,
        "payment_number"  varchar(50) NOT NULL,
        "invoice_id"      uuid,
        "customer_id"     uuid NOT NULL,
        "payment_date"    date NOT NULL,
        "amount"          decimal(18,2) NOT NULL,
        "payment_method"  varchar(50) NOT NULL DEFAULT 'cash',
        "status"          varchar(30) NOT NULL DEFAULT 'completed',
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payments_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payments_tenant_id" ON "payments" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_payment_number" ON "payments" ("payment_number");`);

    // ─── inventory_transactions ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "inventory_transactions" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"         uuid NOT NULL,
        "created_by"        uuid,
        "updated_by"        uuid,
        "product_id"        uuid NOT NULL,
        "transaction_type"  varchar(30) NOT NULL,
        "quantity"          decimal(18,4) NOT NULL,
        "reference_type"    varchar(50),
        "reference_id"      uuid,
        "transaction_date"  TIMESTAMPTZ NOT NULL,
        "notes"             text,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_inventory_tx_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_inventory_tx_tenant_id" ON "inventory_transactions" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_inventory_tx_type" ON "inventory_transactions" ("transaction_type");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_transactions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_orders";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_users";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sales_order_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "membership_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tenant_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tenant_plan_enum";`);
  }
}
