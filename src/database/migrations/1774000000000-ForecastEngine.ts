import { MigrationInterface, QueryRunner } from 'typeorm';

export class ForecastEngine1774000000000 implements MigrationInterface {
  name = 'ForecastEngine1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "forecast_models" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "metric" varchar(40) NOT NULL,
        "method" varchar(40) NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text,
        "parameters" jsonb NOT NULL DEFAULT '{}',
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "version" int NOT NULL DEFAULT 1,
        "last_run_at" TIMESTAMPTZ,
        CONSTRAINT "PK_forecast_models" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_forecast_models_tenant_metric_method"
          UNIQUE ("tenant_id", "metric", "method")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_forecast_models_status" ON "forecast_models" ("tenant_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "forecast_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "metrics" jsonb NOT NULL DEFAULT '[]',
        "methods" jsonb NOT NULL DEFAULT '[]',
        "horizons" jsonb NOT NULL DEFAULT '[]',
        "lookback_days" int NOT NULL DEFAULT 90,
        "data_points" int NOT NULL DEFAULT 0,
        "results_count" int NOT NULL DEFAULT 0,
        "requested_by" uuid,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        "error_message" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_forecast_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_forecast_runs_status" ON "forecast_runs" ("tenant_id", "status", "started_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "forecast_results" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "run_id" uuid NOT NULL,
        "metric" varchar(40) NOT NULL,
        "method" varchar(40) NOT NULL,
        "horizon_days" int NOT NULL,
        "lookback_days" int NOT NULL DEFAULT 90,
        "predicted_value" numeric(20,4) NOT NULL DEFAULT 0,
        "lower_bound" numeric(20,4) NOT NULL DEFAULT 0,
        "upper_bound" numeric(20,4) NOT NULL DEFAULT 0,
        "confidence_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "points" jsonb NOT NULL DEFAULT '[]',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_forecast_results" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_forecast_results_run_metric_method_horizon"
          UNIQUE ("run_id", "metric", "method", "horizon_days"),
        CONSTRAINT "FK_forecast_results_run"
          FOREIGN KEY ("run_id") REFERENCES "forecast_runs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_forecast_results_metric" ON "forecast_results" ("tenant_id", "metric", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "forecast_results" DROP CONSTRAINT IF EXISTS "FK_forecast_results_run"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "forecast_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "forecast_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "forecast_models"`);
  }
}
