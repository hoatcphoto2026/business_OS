import { MigrationInterface, QueryRunner } from 'typeorm';

export class WarehouseLayer1775000000000 implements MigrationInterface {
  name = 'WarehouseLayer1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const base = `
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL,
      "created_by" uuid,
      "updated_by" uuid,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_dim_tenants" (
        ${base},
        "source_tenant_id" uuid NOT NULL,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "plan_code" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL,
        "country" varchar(2),
        "source_updated_at" TIMESTAMPTZ,
        CONSTRAINT "PK_warehouse_dim_tenants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_dim_tenants_source" UNIQUE ("tenant_id", "source_tenant_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_dim_plans" (
        ${base},
        "plan_code" varchar(30) NOT NULL,
        "name" varchar(100) NOT NULL,
        "monthly_price" numeric(14,2) NOT NULL DEFAULT 0,
        "yearly_price" numeric(14,2) NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'VND',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_warehouse_dim_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_dim_plans_code" UNIQUE ("tenant_id", "plan_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_dim_organizations" (
        ${base},
        "source_organization_id" uuid NOT NULL,
        "source_tenant_id" uuid NOT NULL,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL,
        CONSTRAINT "PK_warehouse_dim_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_dim_organizations_source" UNIQUE ("tenant_id", "source_organization_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_dim_departments" (
        ${base},
        "source_department_id" uuid NOT NULL,
        "source_organization_id" uuid NOT NULL,
        "source_tenant_id" uuid NOT NULL,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL,
        CONSTRAINT "PK_warehouse_dim_departments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_dim_departments_source" UNIQUE ("tenant_id", "source_department_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_dim_dates" (
        ${base},
        "date_key" int NOT NULL,
        "calendar_date" date NOT NULL,
        "year" int NOT NULL,
        "quarter" int NOT NULL,
        "month" int NOT NULL,
        "month_name" varchar(20) NOT NULL,
        "week_of_year" int NOT NULL,
        "day_of_week" int NOT NULL,
        "day_name" varchar(20) NOT NULL,
        "is_weekend" boolean NOT NULL,
        CONSTRAINT "PK_warehouse_dim_dates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_dim_dates_key" UNIQUE ("tenant_id", "date_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_warehouse_dim_dates_date" ON "warehouse_dim_dates" ("tenant_id", "calendar_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fact_revenue" (
        ${base},
        "date_key" int NOT NULL,
        "fact_date" date NOT NULL,
        "source_tenant_id" uuid NOT NULL,
        "plan_code" varchar(30) NOT NULL,
        "organization_id" uuid,
        "revenue_amount" numeric(20,2) NOT NULL DEFAULT 0,
        "invoice_count" int NOT NULL DEFAULT 0,
        "mrr" numeric(20,2) NOT NULL DEFAULT 0,
        "active_subscriptions" int NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'VND',
        CONSTRAINT "PK_fact_revenue" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fact_revenue_grain"
          UNIQUE ("tenant_id", "date_key", "source_tenant_id", "plan_code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fact_revenue_date" ON "fact_revenue" ("tenant_id", "fact_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fact_usage" (
        ${base},
        "date_key" int NOT NULL,
        "fact_date" date NOT NULL,
        "source_tenant_id" uuid NOT NULL,
        "metric" varchar(40) NOT NULL,
        "quantity" numeric(20,2) NOT NULL DEFAULT 0,
        "event_count" int NOT NULL DEFAULT 0,
        "organization_id" uuid,
        "department_id" uuid,
        CONSTRAINT "PK_fact_usage" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fact_usage_grain"
          UNIQUE ("tenant_id", "date_key", "source_tenant_id", "metric")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fact_usage_date" ON "fact_usage" ("tenant_id", "fact_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fact_customer" (
        ${base},
        "date_key" int NOT NULL,
        "fact_date" date NOT NULL,
        "source_tenant_id" uuid NOT NULL,
        "plan_code" varchar(30) NOT NULL,
        "organization_id" uuid,
        "department_id" uuid,
        "active_users" int NOT NULL DEFAULT 0,
        "login_count" int NOT NULL DEFAULT 0,
        "tickets_opened" int NOT NULL DEFAULT 0,
        "health_score" numeric(5,2) NOT NULL DEFAULT 0,
        "churn_candidate" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_fact_customer" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fact_customer_grain"
          UNIQUE ("tenant_id", "date_key", "source_tenant_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fact_customer_date" ON "fact_customer" ("tenant_id", "fact_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fact_compliance" (
        ${base},
        "date_key" int NOT NULL,
        "fact_date" date NOT NULL,
        "source_tenant_id" uuid NOT NULL,
        "evidence_total" int NOT NULL DEFAULT 0,
        "evidence_verified" int NOT NULL DEFAULT 0,
        "open_risks" int NOT NULL DEFAULT 0,
        "critical_risks" int NOT NULL DEFAULT 0,
        "compliance_score" numeric(6,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_fact_compliance" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fact_compliance_grain"
          UNIQUE ("tenant_id", "date_key", "source_tenant_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fact_compliance_date" ON "fact_compliance" ("tenant_id", "fact_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fact_security" (
        ${base},
        "date_key" int NOT NULL,
        "fact_date" date NOT NULL,
        "source_tenant_id" uuid NOT NULL,
        "security_events" int NOT NULL DEFAULT 0,
        "critical_events" int NOT NULL DEFAULT 0,
        "failed_logins" int NOT NULL DEFAULT 0,
        "open_alerts" int NOT NULL DEFAULT 0,
        "risk_score" numeric(6,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_fact_security" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fact_security_grain"
          UNIQUE ("tenant_id", "date_key", "source_tenant_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fact_security_date" ON "fact_security" ("tenant_id", "fact_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_snapshots" (
        ${base},
        "snapshot_date" date NOT NULL,
        "period_type" varchar(10) NOT NULL,
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "tenants" int NOT NULL DEFAULT 0,
        "fact_rows" int NOT NULL DEFAULT 0,
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_warehouse_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_snapshots_grain"
          UNIQUE ("tenant_id", "snapshot_date", "period_type")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_warehouse_snapshots_period" ON "warehouse_snapshots" ("tenant_id", "period_type", "snapshot_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'warehouse_snapshots',
      'fact_security',
      'fact_compliance',
      'fact_customer',
      'fact_usage',
      'fact_revenue',
      'warehouse_dim_dates',
      'warehouse_dim_departments',
      'warehouse_dim_organizations',
      'warehouse_dim_plans',
      'warehouse_dim_tenants',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}

