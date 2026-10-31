import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoNotification1760000000000 implements MigrationInterface {
  name = 'AutoNotification1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auto_notification_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "event" varchar(40) NOT NULL,
        "channel" varchar(20) NOT NULL,
        "template_code" varchar(100),
        "recipient" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" int NOT NULL DEFAULT 1,
        "error_message" text,
        "sent_at" TIMESTAMPTZ,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_auto_notification_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_autonotif_tenant_status" ON "auto_notification_logs" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_autonotif_event_channel" ON "auto_notification_logs" ("event", "channel")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auto_notification_logs"`);
  }
}
