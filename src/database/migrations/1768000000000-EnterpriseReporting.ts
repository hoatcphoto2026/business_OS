import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnterpriseReporting1768000000000 implements MigrationInterface {
  name = 'EnterpriseReporting1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "report_type" varchar(40) NOT NULL,
        "format" varchar(10) NOT NULL DEFAULT 'JSON',
        "period_from" TIMESTAMPTZ,
        "period_to" TIMESTAMPTZ,
        "status" varchar(20) NOT NULL DEFAULT 'COMPLETED',
        "row_count" int NOT NULL DEFAULT 0,
        "summary" jsonb NOT NULL DEFAULT '{}',
        "error" text,
        "schedule_id" uuid,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_report_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_report_runs_type" ON "report_runs" ("tenant_id", "report_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_report_runs_created" ON "report_runs" ("tenant_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_schedules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "report_type" varchar(40) NOT NULL,
        "format" varchar(10) NOT NULL DEFAULT 'PDF',
        "frequency" varchar(10) NOT NULL DEFAULT 'WEEKLY',
        "delivery_channels" jsonb NOT NULL DEFAULT '[]',
        "recipients" jsonb NOT NULL DEFAULT '[]',
        "webhook_ids" jsonb NOT NULL DEFAULT '[]',
        "params" jsonb NOT NULL DEFAULT '{}',
        "enabled" boolean NOT NULL DEFAULT true,
        "next_run_at" TIMESTAMPTZ,
        "last_run_at" TIMESTAMPTZ,
        "last_run_id" uuid,
        CONSTRAINT "PK_report_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_report_schedules_tenant_name" UNIQUE ("tenant_id", "name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_report_schedules_enabled" ON "report_schedules" ("tenant_id", "enabled")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_deliveries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "run_id" uuid NOT NULL,
        "channel" varchar(20) NOT NULL,
        "target" varchar(255),
        "status" varchar(20) NOT NULL,
        "error" text,
        "delivered_at" TIMESTAMPTZ,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_report_deliveries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_report_deliveries_run" ON "report_deliveries" ("tenant_id", "run_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_report_deliveries_channel" ON "report_deliveries" ("tenant_id", "channel")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "report_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_runs"`);
  }
}
