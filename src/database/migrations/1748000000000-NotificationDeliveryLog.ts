import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationDeliveryLog1748000000000 implements MigrationInterface {
  name = 'NotificationDeliveryLog1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_delivery_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "notification_id" uuid NOT NULL,
        "channel" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "attempt_count" int NOT NULL DEFAULT 0,
        "last_attempt_at" TIMESTAMPTZ,
        "sent_at" TIMESTAMPTZ,
        "error_message" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_notification_delivery_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_logs_notification" FOREIGN KEY ("notification_id")
          REFERENCES "notifications"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_delivery_logs_tenant_status" ON "notification_delivery_logs" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_delivery_logs_notification" ON "notification_delivery_logs" ("notification_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_delivery_logs"`);
  }
}
