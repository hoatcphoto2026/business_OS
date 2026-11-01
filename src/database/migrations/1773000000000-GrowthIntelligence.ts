import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrowthIntelligence1773000000000 implements MigrationInterface {
  name = 'GrowthIntelligence1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "snapshot_date" date NOT NULL,
        "period_type" varchar(10) NOT NULL,
        "trial_conversion_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "paid_conversion_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "expansion_rate_pct" numeric(7,2) NOT NULL DEFAULT 0,
        "upsell_rate_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "activation_rate_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "onboarding_success_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "tenants" int NOT NULL DEFAULT 0,
        "trials" int NOT NULL DEFAULT 0,
        "paid_tenants" int NOT NULL DEFAULT 0,
        "activated_tenants" int NOT NULL DEFAULT 0,
        "upgrades" int NOT NULL DEFAULT 0,
        "downgrades" int NOT NULL DEFAULT 0,
        "mrr" numeric(20,2) NOT NULL DEFAULT 0,
        "funnel" jsonb NOT NULL DEFAULT '{}',
        "by_source" jsonb NOT NULL DEFAULT '[]',
        "by_plan" jsonb NOT NULL DEFAULT '[]',
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_growth_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_growth_snapshots_tenant_date_period"
          UNIQUE ("tenant_id", "snapshot_date", "period_type")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_growth_snapshots_period" ON "growth_snapshots" ("tenant_id", "period_type", "snapshot_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_experiments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "hypothesis" text,
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "audience" varchar(120) NOT NULL DEFAULT 'ALL_TENANTS',
        "variant_a" varchar(120) NOT NULL DEFAULT 'CONTROL',
        "variant_b" varchar(120) NOT NULL DEFAULT 'VARIANT',
        "sample_a" int NOT NULL DEFAULT 0,
        "sample_b" int NOT NULL DEFAULT 0,
        "conversion_a" numeric(6,2) NOT NULL DEFAULT 0,
        "conversion_b" numeric(6,2) NOT NULL DEFAULT 0,
        "uplift_pct" numeric(7,2) NOT NULL DEFAULT 0,
        "started_at" TIMESTAMPTZ,
        "ended_at" TIMESTAMPTZ,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_growth_experiments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_growth_experiments_tenant_name" UNIQUE ("tenant_id", "name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_growth_experiments_status" ON "growth_experiments" ("tenant_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_segments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "dimension" varchar(20) NOT NULL,
        "segment_key" varchar(100) NOT NULL,
        "label" varchar(255) NOT NULL,
        "period" varchar(7) NOT NULL,
        "tenants" int NOT NULL DEFAULT 0,
        "trials" int NOT NULL DEFAULT 0,
        "paid_tenants" int NOT NULL DEFAULT 0,
        "conversions" int NOT NULL DEFAULT 0,
        "mrr" numeric(20,2) NOT NULL DEFAULT 0,
        "share_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_growth_segments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_growth_segments_tenant_dim_key_period"
          UNIQUE ("tenant_id", "dimension", "segment_key", "period")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_growth_segments_dimension" ON "growth_segments" ("tenant_id", "dimension", "period")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_segments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_experiments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_snapshots"`);
  }
}
