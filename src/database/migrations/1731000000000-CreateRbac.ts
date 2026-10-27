import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRbac1731000000000 implements MigrationInterface {
  name = 'CreateRbac1731000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // permissions (global)
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "module"      varchar(50) NOT NULL,
        "action"      varchar(50) NOT NULL,
        "code"        varchar(100) NOT NULL UNIQUE,
        "description" text,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_permissions_code" ON "permissions" ("code");`);

    // roles (tenant-scoped)
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "code"        varchar(50) NOT NULL,
        "name"        varchar(100) NOT NULL,
        "description" text,
        "status"      varchar(20) NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_roles_tenant_code" UNIQUE ("tenant_id", "code"),
        CONSTRAINT "FK_roles_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_roles_tenant" ON "roles" ("tenant_id");`);

    // role_permissions
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "role_id"       uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_role_permissions" UNIQUE ("role_id", "permission_id"),
        CONSTRAINT "FK_rp_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rp_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      );
    `);

    // user_roles
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"    uuid NOT NULL,
        "role_id"    uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_roles" UNIQUE ("user_id", "role_id"),
        CONSTRAINT "FK_ur_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ur_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
  }
}
