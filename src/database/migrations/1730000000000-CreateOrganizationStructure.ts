import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 2 – Organization Structure
 *
 * Creates:
 * - companies, branches, departments
 * - user_companies, user_branches, user_departments (mapping)
 * - Adds company_id, branch_id to all business tables
 * - Creates BaseOrganizationEntity columns
 */
export class CreateOrganizationStructure1730000000000
  implements MigrationInterface
{
  name = 'CreateOrganizationStructure1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── enums ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "org_status_enum" AS ENUM ('active', 'inactive');
    `);

    // ─── companies ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "code"        varchar(50) NOT NULL,
        "name"        varchar(255) NOT NULL,
        "tax_code"    varchar(50),
        "status"      "org_status_enum" NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_companies_tenant_code" UNIQUE ("tenant_id", "code"),
        CONSTRAINT "FK_companies_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_companies_tenant" ON "companies" ("tenant_id");`);

    // ─── branches ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "branches" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "company_id"  uuid NOT NULL,
        "code"        varchar(50) NOT NULL,
        "name"        varchar(255) NOT NULL,
        "status"      "org_status_enum" NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_branches_company_code" UNIQUE ("tenant_id", "company_id", "code"),
        CONSTRAINT "FK_branches_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_branches_company" ON "branches" ("company_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_branches_tenant" ON "branches" ("tenant_id");`);

    // ─── departments ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "departments" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "company_id"  uuid NOT NULL,
        "branch_id"   uuid NOT NULL,
        "code"        varchar(50) NOT NULL,
        "name"        varchar(255) NOT NULL,
        "status"      "org_status_enum" NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_departments_branch_code" UNIQUE ("tenant_id", "branch_id", "code"),
        CONSTRAINT "FK_departments_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_departments_branch" ON "departments" ("branch_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_departments_tenant" ON "departments" ("tenant_id");`);

    // ─── mapping tables ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "user_companies" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"     uuid NOT NULL,
        "company_id"  uuid NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_companies" UNIQUE ("user_id", "company_id"),
        CONSTRAINT "FK_user_companies_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_companies_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "user_branches" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"     uuid NOT NULL,
        "branch_id"   uuid NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_branches" UNIQUE ("user_id", "branch_id"),
        CONSTRAINT "FK_user_branches_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "user_departments" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"     uuid NOT NULL,
        "department_id" uuid NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_departments" UNIQUE ("user_id", "department_id"),
        CONSTRAINT "FK_user_departments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_departments_department" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE
      );
    `);

    // ─── Add company_id / branch_id to business tables ─────────
    const businessTables = [
      'customers',
      'products',
      'sales_orders',
      'invoices',
      'payments',
      'inventory_transactions',
    ];

    for (const table of businessTables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "company_id" uuid,
        ADD COLUMN IF NOT EXISTS "branch_id" uuid;
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_company" ON "${table}" ("company_id");
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_branch" ON "${table}" ("branch_id");
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const businessTables = [
      'customers',
      'products',
      'sales_orders',
      'invoices',
      'payments',
      'inventory_transactions',
    ];
    for (const table of businessTables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "branch_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "company_id";`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "user_departments";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_branches";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_companies";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "departments";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branches";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "org_status_enum";`);
  }
}
