import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoSuspension1758000000000 implements MigrationInterface {
  name = 'AutoSuspension1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suspension_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "trigger" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" int NOT NULL DEFAULT 1,
        "users_disabled" int NOT NULL DEFAULT 0,
        "api_keys_revoked" int NOT NULL DEFAULT 0,
        "error_message" text,
        "processed_at" TIMESTAMPTZ,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_suspension_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_susp_tenant_status" ON "suspension_records" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_susp_trigger" ON "suspension_records" ("trigger")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "suspension_records"`);
  }
}
