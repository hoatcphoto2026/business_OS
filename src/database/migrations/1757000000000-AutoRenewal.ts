import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoRenewal1757000000000 implements MigrationInterface {
  name = 'AutoRenewal1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "renewal_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "subscription_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" int NOT NULL DEFAULT 1,
        "invoice_id" uuid,
        "payment_id" uuid,
        "error_message" text,
        "processed_at" TIMESTAMPTZ,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_renewal_attempts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_renewal_tenant_status" ON "renewal_attempts" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_renewal_sub" ON "renewal_attempts" ("subscription_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "renewal_attempts"`);
  }
}
