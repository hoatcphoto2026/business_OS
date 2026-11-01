import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevenueIntelligence1770000000000 implements MigrationInterface {
  name = 'RevenueIntelligence1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "revenue_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "snapshot_date" date NOT NULL,
        "period_type" varchar(10) NOT NULL,
        "mrr" numeric(20,2) NOT NULL DEFAULT 0,
        "arr" numeric(20,2) NOT NULL DEFAULT 0,
        "expansion_revenue" numeric(20,2) NOT NULL DEFAULT 0,
        "contraction_revenue" numeric(20,2) NOT NULL DEFAULT 0,
        "net_new_revenue" numeric(20,2) NOT NULL DEFAULT 0,
        "paid_revenue" numeric(20,2) NOT NULL DEFAULT 0,
        "paying_customers" int NOT NULL DEFAULT 0,
        "customer_count" int NOT NULL DEFAULT 0,
        "by_plan" jsonb NOT NULL DEFAULT '[]',
        "by_tenant" jsonb NOT NULL DEFAULT '[]',
        "by_country" jsonb NOT NULL DEFAULT '[]',
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_revenue_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_revenue_snapshots_tenant_date_period"
          UNIQUE ("tenant_id", "snapshot_date", "period_type")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_revenue_snapshots_period" ON "revenue_snapshots" ("tenant_id", "period_type", "snapshot_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "revenue_forecasts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "horizon" varchar(20) NOT NULL,
        "as_of" date NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "predicted_revenue" numeric(20,2) NOT NULL,
        "lower_bound" numeric(20,2) NOT NULL,
        "upper_bound" numeric(20,2) NOT NULL,
        "confidence" numeric(5,4) NOT NULL DEFAULT 0,
        "method" varchar(60) NOT NULL DEFAULT 'MRR_GROWTH_LINEAR',
        "inputs" jsonb NOT NULL DEFAULT '{}',
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_revenue_forecasts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_revenue_forecasts_tenant_horizon_asof"
          UNIQUE ("tenant_id", "horizon", "as_of")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_revenue_forecasts_horizon" ON "revenue_forecasts" ("tenant_id", "horizon", "as_of")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "revenue_segments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "dimension" varchar(20) NOT NULL,
        "segment_key" varchar(100) NOT NULL,
        "label" varchar(255) NOT NULL,
        "mrr" numeric(20,2) NOT NULL DEFAULT 0,
        "arr" numeric(20,2) NOT NULL DEFAULT 0,
        "share_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "customers" int NOT NULL DEFAULT 0,
        "period" varchar(7) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_revenue_segments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_revenue_segments_tenant_dim_key_period"
          UNIQUE ("tenant_id", "dimension", "segment_key", "period")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_revenue_segments_dimension" ON "revenue_segments" ("tenant_id", "dimension", "period")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "revenue_segments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "revenue_forecasts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "revenue_snapshots"`);
  }
}
