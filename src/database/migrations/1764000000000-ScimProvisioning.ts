import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScimProvisioning1764000000000 implements MigrationInterface {
  name = 'ScimProvisioning1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scim_endpoints" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "default_role" varchar(50) NOT NULL DEFAULT 'member',
        "organization_code" varchar(50) NOT NULL DEFAULT 'scim',
        "last_used_at" TIMESTAMPTZ,
        CONSTRAINT "PK_scim_endpoints" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_scim_endpoints_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scim_endpoints_tenant" ON "scim_endpoints" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scim_mappings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "endpoint_id" uuid NOT NULL,
        "resource_type" varchar(20) NOT NULL,
        "sync_target" varchar(20),
        "external_id" varchar(255),
        "user_name" varchar(255),
        "display_name" varchar(255),
        "internal_user_id" uuid,
        "internal_org_id" uuid,
        "internal_department_id" uuid,
        "role_code" varchar(50),
        "department_name" varchar(255),
        "organization_name" varchar(255),
        "active" boolean NOT NULL DEFAULT true,
        "deleted" boolean NOT NULL DEFAULT false,
        "members" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_scim_mappings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scim_mappings_endpoint_type" ON "scim_mappings" ("endpoint_id", "resource_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scim_mappings_tenant" ON "scim_mappings" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_scim_mappings_external"
         ON "scim_mappings" ("endpoint_id", "resource_type", "external_id")
         WHERE "external_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scim_provisioning_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "endpoint_id" uuid NOT NULL,
        "operation" varchar(40) NOT NULL,
        "status" varchar(20) NOT NULL,
        "attempts" int NOT NULL DEFAULT 1,
        "resource_id" uuid,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "error" text,
        "trace_id" varchar(128),
        "completed_at" TIMESTAMPTZ,
        "dead_letter_at" TIMESTAMPTZ,
        CONSTRAINT "PK_scim_provisioning_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scim_logs_tenant_status" ON "scim_provisioning_logs" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scim_logs_endpoint_created" ON "scim_provisioning_logs" ("endpoint_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "scim_provisioning_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scim_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scim_endpoints"`);
  }
}
