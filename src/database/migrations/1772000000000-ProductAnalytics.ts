import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductAnalytics1772000000000 implements MigrationInterface {
  name = 'ProductAnalytics1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feature_usage" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "feature_key" varchar(40) NOT NULL,
        "user_id" uuid,
        "organization_id" uuid,
        "department_id" uuid,
        "action" varchar(20) NOT NULL DEFAULT 'USE',
        "quantity" int NOT NULL DEFAULT 1,
        "user_count" int NOT NULL DEFAULT 0,
        "source" varchar(20) NOT NULL DEFAULT 'TRACKED',
        "dedupe_key" varchar(160),
        "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_feature_usage" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feature_usage_tenant_dedupe" UNIQUE ("tenant_id", "dedupe_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_feature_usage_feature_time" ON "feature_usage" ("tenant_id", "feature_key", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_feature_usage_occurred" ON "feature_usage" ("occurred_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feature_adoption" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "feature_key" varchar(40) NOT NULL,
        "dimension" varchar(20) NOT NULL,
        "dimension_key" varchar(100) NOT NULL,
        "dimension_label" varchar(255) NOT NULL,
        "period" varchar(7) NOT NULL,
        "usage_count" int NOT NULL DEFAULT 0,
        "active_tenants" int NOT NULL DEFAULT 0,
        "active_users" int NOT NULL DEFAULT 0,
        "adoption_pct" numeric(6,2) NOT NULL DEFAULT 0,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_feature_adoption" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feature_adoption_tenant_feature_dim_key_period"
          UNIQUE ("tenant_id", "feature_key", "dimension", "dimension_key", "period")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_feature_adoption_dimension" ON "feature_adoption" ("tenant_id", "dimension", "period")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feature_trends" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "feature_key" varchar(40) NOT NULL,
        "period_date" date NOT NULL,
        "usage_count" int NOT NULL DEFAULT 0,
        "active_tenants" int NOT NULL DEFAULT 0,
        "active_users" int NOT NULL DEFAULT 0,
        "growth_pct" numeric(7,2) NOT NULL DEFAULT 0,
        "retention_pct" numeric(6,2),
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feature_trends" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feature_trends_tenant_feature_date"
          UNIQUE ("tenant_id", "feature_key", "period_date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_feature_trends_date" ON "feature_trends" ("tenant_id", "period_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_trends"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_adoption"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_usage"`);
  }
}
