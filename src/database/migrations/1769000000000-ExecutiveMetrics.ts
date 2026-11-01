import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExecutiveMetrics1769000000000 implements MigrationInterface {
  name = 'ExecutiveMetrics1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "executive_metrics" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(40) NOT NULL,
        "name" varchar(120) NOT NULL,
        "unit" varchar(20) NOT NULL,
        "current_value" numeric(20,4) NOT NULL DEFAULT 0,
        "previous_value" numeric(20,4),
        "change_pct" numeric(10,2) NOT NULL DEFAULT 0,
        "period_type" varchar(10) NOT NULL DEFAULT 'DAILY',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "calculated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_executive_metrics" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_executive_metrics_tenant_code" UNIQUE ("tenant_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "executive_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "snapshot_date" date NOT NULL,
        "period_type" varchar(10) NOT NULL,
        "metrics" jsonb NOT NULL DEFAULT '[]',
        "summary" jsonb NOT NULL DEFAULT '{}',
        "generated_by" uuid,
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_executive_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_executive_snapshots_tenant_date_period"
          UNIQUE ("tenant_id", "snapshot_date", "period_type")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_executive_snapshots_period" ON "executive_snapshots" ("tenant_id", "period_type", "snapshot_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metric_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "metric_code" varchar(40) NOT NULL,
        "value" numeric(20,4) NOT NULL,
        "unit" varchar(20) NOT NULL,
        "period_type" varchar(10) NOT NULL,
        "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "snapshot_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_metric_history" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_metric_history_code" ON "metric_history" ("tenant_id", "metric_code", "recorded_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_metric_history_period" ON "metric_history" ("tenant_id", "period_type", "recorded_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "metric_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "executive_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "executive_metrics"`);
  }
}
