import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScopeAndTeams1732000000000 implements MigrationInterface {
  name = 'CreateScopeAndTeams1732000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── owner_id on ALL organization-aware tables ───
    const orgTables = [
      'customers',
      'sales_orders',
      'products',
      'invoices',
      'payments',
      'inventory_transactions',
    ];

    for (const table of orgTables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "owner_id" uuid;
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_owner" ON "${table}" ("owner_id");
      `);
    }

    // ─── teams ───
    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "company_id"  uuid,
        "branch_id"   uuid,
        "code"        varchar(50) NOT NULL,
        "name"        varchar(255) NOT NULL,
        "manager_id"  uuid,
        "status"      varchar(20) NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_teams_tenant_code" UNIQUE ("tenant_id", "code"),
        CONSTRAINT "FK_teams_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teams_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_teams_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_teams_tenant" ON "teams" ("tenant_id");`);

    // ─── team_members ───
    await queryRunner.query(`
      CREATE TABLE "team_members" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "team_id"     uuid NOT NULL,
        "user_id"     uuid NOT NULL,
        "is_manager"  boolean NOT NULL DEFAULT false,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_team_members" UNIQUE ("team_id", "user_id"),
        CONSTRAINT "FK_tm_team" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tm_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_team_members_team" ON "team_members" ("team_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_team_members_user" ON "team_members" ("user_id");`);

    // ─── role_scopes ───
    await queryRunner.query(`
      CREATE TABLE "role_scopes" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "role_id"     uuid NOT NULL,
        "resource"    varchar(100) NOT NULL,
        "scope"       varchar(20) NOT NULL DEFAULT 'SELF',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_role_scopes" UNIQUE ("role_id", "resource"),
        CONSTRAINT "FK_rs_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_role_scopes_role" ON "role_scopes" ("role_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_scopes";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "team_members";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "teams";`);
    // Drop owner_id from all org tables
    const orgTables = [
      'customers',
      'sales_orders',
      'products',
      'invoices',
      'payments',
      'inventory_transactions',
    ];
    for (const table of orgTables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "owner_id";`);
    }
  }
}
