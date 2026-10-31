import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscription1744000000000 implements MigrationInterface {
  name = 'CreateSubscription1744000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plans" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"           varchar(30) NOT NULL UNIQUE,
        "name"           varchar(100) NOT NULL,
        "description"    text,
        "monthly_price"  numeric(14,2) NOT NULL DEFAULT 0,
        "yearly_price"   numeric(14,2) NOT NULL DEFAULT 0,
        "currency"       varchar(3) NOT NULL DEFAULT 'VND',
        "is_active"      boolean NOT NULL DEFAULT true,
        "trial_days"     int NOT NULL DEFAULT 14,
        "sort_order"     int NOT NULL DEFAULT 0,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE "plan_features" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "plan_id"        uuid NOT NULL,
        "feature_code"   varchar(40) NOT NULL,
        "limit_value"    int,
        "is_unlimited"   boolean NOT NULL DEFAULT false,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_plan_features_plan"
          FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_plan_features" UNIQUE ("plan_id", "feature_code")
      );

      CREATE INDEX "IDX_plan_features_plan" ON "plan_features" ("plan_id");

      CREATE TABLE "subscriptions" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"             uuid NOT NULL,
        "plan_id"               uuid NOT NULL,
        "status"                varchar(30) NOT NULL DEFAULT 'TRIAL',
        "billing_cycle"         varchar(20) NOT NULL DEFAULT 'MONTHLY',
        "current_period_start"  TIMESTAMPTZ,
        "current_period_end"    TIMESTAMPTZ,
        "trial_end"             TIMESTAMPTZ,
        "cancel_at_period_end"  boolean NOT NULL DEFAULT false,
        "cancelled_at"          TIMESTAMPTZ,
        "grace_period_end"      TIMESTAMPTZ,
        "external_id"           varchar(255),
        "metadata"              jsonb NOT NULL DEFAULT '{}',
        "created_by"            uuid,
        "updated_by"            uuid,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_subscriptions_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscriptions_plan"
          FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_subscriptions_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_subscriptions_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
      );

      CREATE INDEX "IDX_subscriptions_tenant" ON "subscriptions" ("tenant_id");
      CREATE INDEX "IDX_subscriptions_plan" ON "subscriptions" ("plan_id");
      CREATE INDEX "IDX_subscriptions_status" ON "subscriptions" ("status");
      CREATE UNIQUE INDEX "UQ_subscriptions_tenant_current"
        ON "subscriptions" ("tenant_id")
        WHERE "status" NOT IN ('CANCELLED', 'EXPIRED');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "subscriptions";
      DROP TABLE IF EXISTS "plan_features";
      DROP TABLE IF EXISTS "plans";
    `);
  }
}
