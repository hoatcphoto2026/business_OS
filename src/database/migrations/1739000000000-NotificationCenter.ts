import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationCenter1739000000000 implements MigrationInterface {
  name = 'NotificationCenter1739000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "body" text,
        "type" varchar(50) NOT NULL DEFAULT 'info',
        "channel" varchar(30) NOT NULL DEFAULT 'in_app',
        "status" varchar(20) NOT NULL DEFAULT 'unread',
        "data" jsonb,
        "read_at" TIMESTAMPTZ,
        "event_type" varchar(100),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_tenant_user" ON "notifications" ("tenant_id", "user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_status" ON "notifications" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_created" ON "notifications" ("created_at" DESC)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(100) NOT NULL,
        "channel" varchar(30) NOT NULL DEFAULT 'in_app',
        "subject" varchar(255),
        "body" text NOT NULL,
        "variables" jsonb,
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_notification_templates" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_templates_code" ON "notification_templates" ("code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
