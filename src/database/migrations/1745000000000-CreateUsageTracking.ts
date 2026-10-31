import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsageTracking1745000000000 implements MigrationInterface {
  name = 'CreateUsageTracking1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "usage_records" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "metric"      varchar(40) NOT NULL,
        "quantity"    int NOT NULL DEFAULT 1,
        "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "metadata"    jsonb NOT NULL DEFAULT '{}',
        "created_by"  uuid,
        "updated_by"  uuid,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_usage_records_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_usage_records_tenant_metric_time"
        ON "usage_records" ("tenant_id", "metric", "recorded_at");

      CREATE TABLE "usage_daily" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "metric"      varchar(40) NOT NULL,
        "day"         date NOT NULL,
        "total"       int NOT NULL DEFAULT 0,
        "created_by"  uuid,
        "updated_by"  uuid,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_usage_daily_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_usage_daily" UNIQUE ("tenant_id", "metric", "day")
      );
      CREATE INDEX "IDX_usage_daily_tenant_day" ON "usage_daily" ("tenant_id", "day");

      CREATE TABLE "usage_monthly" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "metric"      varchar(40) NOT NULL,
        "month"       varchar(7) NOT NULL,
        "total"       int NOT NULL DEFAULT 0,
        "created_by"  uuid,
        "updated_by"  uuid,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_usage_monthly_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_usage_monthly" UNIQUE ("tenant_id", "metric", "month")
      );
      CREATE INDEX "IDX_usage_monthly_tenant_month" ON "usage_monthly" ("tenant_id", "month");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "usage_monthly";
      DROP TABLE IF EXISTS "usage_daily";
      DROP TABLE IF EXISTS "usage_records";
    `);
  }
}
