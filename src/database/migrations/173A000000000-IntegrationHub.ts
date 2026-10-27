import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationHub173A000000000 implements MigrationInterface {
  name = 'IntegrationHub173A000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "key_hash" varchar(255) NOT NULL,
        "key_prefix" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "expires_at" TIMESTAMPTZ,
        "last_used_at" TIMESTAMPTZ,
        CONSTRAINT "PK_api_keys" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_api_keys_prefix" ON "api_keys" ("key_prefix")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhooks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "url" varchar(500) NOT NULL,
        "events" jsonb NOT NULL DEFAULT '[]',
        "secret" varchar(255),
        "status" varchar(20) NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_webhooks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connectors" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "config" jsonb,
        "status" varchar(20) NOT NULL DEFAULT 'inactive',
        CONSTRAINT "PK_connectors" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_connectors_code" ON "connectors" ("code")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "integration_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "connector_id" uuid,
        "webhook_id" uuid,
        "direction" varchar(20) NOT NULL,
        "event" varchar(100) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'success',
        "payload" jsonb,
        "response" jsonb,
        "error" text,
        CONSTRAINT "PK_integration_logs" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "integration_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connectors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhooks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
  }
}
