import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventAutomation1756000000000 implements MigrationInterface {
  name = 'EventAutomation1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_automation_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "event_id" uuid NOT NULL,
        "event_type" varchar(60) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" int NOT NULL DEFAULT 0,
        "max_retries" int NOT NULL DEFAULT 3,
        "last_error" text,
        "processed_at" TIMESTAMPTZ,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "idempotency_key" varchar(128),
        CONSTRAINT "PK_event_automation_logs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_automation_event_id" UNIQUE ("event_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_auto_tenant_status" ON "event_automation_logs" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_auto_type_status" ON "event_automation_logs" ("event_type", "status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "event_automation_logs"`);
  }
}
