import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantOffboarding1751000000000 implements MigrationInterface {
  name = 'TenantOffboarding1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_offboardings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "status" varchar(20) NOT NULL DEFAULT 'REQUESTED',
        "requested_by" uuid NOT NULL,
        "current_step" varchar(50) NOT NULL DEFAULT 'REQUESTED',
        "error_message" text,
        "export_summary" jsonb NOT NULL DEFAULT '{}',
        "archive_ref" varchar(500),
        "report" jsonb NOT NULL DEFAULT '{}',
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_tenant_offboardings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_offboardings_tenant_status" ON "tenant_offboardings" ("tenant_id", "status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_offboardings"`);
  }
}
