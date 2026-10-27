import { MigrationInterface, QueryRunner } from 'typeorm';

export class MasterDataPlatform1738000000000 implements MigrationInterface {
  name = 'MasterDataPlatform1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enhance customers
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_code" varchar(50)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "payment_term_id" uuid`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "currency_id" uuid`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_limit" decimal(18,2)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "notes" text`);

    // Enhance products
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "barcode" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "uom_id" uuid`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "default_warehouse_id" uuid`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tax_id" uuid`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" text`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "min_stock" decimal(18,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "max_stock" decimal(18,4)`);

    // New tables
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "code" varchar(50),
        "email" varchar(255),
        "phone" varchar(30),
        "address" text,
        "tax_code" varchar(50),
        "payment_term_id" uuid,
        "currency_id" uuid,
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "owner_id" uuid,
        CONSTRAINT "PK_suppliers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_suppliers_tenant" ON "suppliers" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_suppliers_owner" ON "suppliers" ("owner_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "code" varchar(50),
        "address" text,
        "is_default" boolean NOT NULL DEFAULT false,
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "owner_id" uuid,
        CONSTRAINT "PK_warehouses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_warehouses_tenant" ON "warehouses" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bank_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "bank_name" varchar(255) NOT NULL,
        "account_number" varchar(50) NOT NULL,
        "account_name" varchar(255) NOT NULL,
        "currency_id" uuid,
        "branch_name" varchar(255),
        "is_default" boolean NOT NULL DEFAULT false,
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "owner_id" uuid,
        CONSTRAINT "PK_bank_accounts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "taxes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "rate" decimal(5,2) NOT NULL DEFAULT 0,
        "type" varchar(30) NOT NULL DEFAULT 'VAT',
        "is_default" boolean NOT NULL DEFAULT false,
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "owner_id" uuid,
        CONSTRAINT "PK_taxes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_taxes_tenant_code" ON "taxes" ("tenant_id", "code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_terms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "days" integer NOT NULL DEFAULT 0,
        "description" text,
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "owner_id" uuid,
        CONSTRAINT "PK_payment_terms" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_terms_tenant_code" ON "payment_terms" ("tenant_id", "code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "currencies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(10) NOT NULL,
        "name" varchar(100) NOT NULL,
        "symbol" varchar(10),
        "exchange_rate" decimal(18,6) NOT NULL DEFAULT 1,
        "is_base" boolean NOT NULL DEFAULT false,
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "owner_id" uuid,
        CONSTRAINT "PK_currencies" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_currencies_tenant_code" ON "currencies" ("tenant_id", "code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "unit_of_measures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(20) NOT NULL,
        "name" varchar(100) NOT NULL,
        "type" varchar(30) NOT NULL DEFAULT 'QUANTITY',
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "owner_id" uuid,
        CONSTRAINT "PK_unit_of_measures" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_uom_tenant_code" ON "unit_of_measures" ("tenant_id", "code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "unit_of_measures"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "currencies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_terms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "taxes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "warehouses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
    // Columns on customers/products left for safety
  }
}
