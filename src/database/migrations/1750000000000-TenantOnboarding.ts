import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantOnboarding1750000000000 implements MigrationInterface {
  name = 'TenantOnboarding1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_onboardings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "tenant_id" uuid,
        "owner_user_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "current_step" varchar(50) NOT NULL DEFAULT 'INIT',
        "error_message" text,
        "retry_count" int NOT NULL DEFAULT 0,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_tenant_onboardings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_onboardings_status" ON "tenant_onboardings" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_onboardings"`);
  }
}
