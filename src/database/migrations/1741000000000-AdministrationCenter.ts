import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdministrationCenter1741000000000 implements MigrationInterface {
  name = 'AdministrationCenter1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // tenant_settings
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL UNIQUE,
        "timezone" varchar(50) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
        "currency" varchar(10) NOT NULL DEFAULT 'VND',
        "language" varchar(10) NOT NULL DEFAULT 'vi',
        "date_format" varchar(20) NOT NULL DEFAULT 'DD/MM/YYYY',
        "business_mode" varchar(20) NOT NULL DEFAULT 'business',
        "accounting_mode" varchar(20) NOT NULL DEFAULT 'standard',
        "copilot_enabled" boolean NOT NULL DEFAULT true,
        "notification_enabled" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_settings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // login_histories
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "login_histories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "ip_address" varchar(45),
        "user_agent" text,
        "login_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "logout_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_login_histories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_login_histories_tenant" ON "login_histories" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_login_histories_user" ON "login_histories" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_login_histories_login_at" ON "login_histories" ("login_at")`);

    // copilot_settings
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "copilot_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL UNIQUE,
        "enabled" boolean NOT NULL DEFAULT true,
        "provider" varchar(50) NOT NULL DEFAULT 'mock',
        "temperature" decimal(3,2) NOT NULL DEFAULT 0.7,
        "max_tokens" integer NOT NULL DEFAULT 1024,
        "system_prompt" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_copilot_settings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_copilot_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "copilot_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "login_histories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_settings"`);
  }
}
