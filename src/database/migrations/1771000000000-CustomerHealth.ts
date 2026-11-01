import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerHealth1771000000000 implements MigrationInterface {
  name = 'CustomerHealth1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_health_scores" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "target_tenant_id" uuid NOT NULL,
        "target_tenant_code" varchar(50) NOT NULL,
        "target_tenant_name" varchar(255) NOT NULL,
        "score" numeric(5,2) NOT NULL DEFAULT 0,
        "level" varchar(20) NOT NULL DEFAULT 'WARNING',
        "previous_score" numeric(5,2),
        "trend" varchar(10) NOT NULL DEFAULT 'STABLE',
        "signals" jsonb NOT NULL DEFAULT '[]',
        "risk_drivers" jsonb NOT NULL DEFAULT '[]',
        "primary_risk" varchar(60),
        "churn_candidate" boolean NOT NULL DEFAULT false,
        "scored_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_customer_health_scores" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_health_scores_tenant_target"
          UNIQUE ("tenant_id", "target_tenant_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_health_scores_level" ON "customer_health_scores" ("tenant_id", "level")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "health_signals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(40) NOT NULL,
        "name" varchar(120) NOT NULL,
        "weight" numeric(5,2) NOT NULL DEFAULT 0,
        "description" text,
        "enabled" boolean NOT NULL DEFAULT true,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_health_signals" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_health_signals_tenant_code" UNIQUE ("tenant_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "health_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "target_tenant_id" uuid NOT NULL,
        "snapshot_date" date NOT NULL,
        "score" numeric(5,2) NOT NULL DEFAULT 0,
        "level" varchar(20) NOT NULL DEFAULT 'WARNING',
        "signals" jsonb NOT NULL DEFAULT '[]',
        "risk_drivers" jsonb NOT NULL DEFAULT '[]',
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_health_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_health_snapshots_tenant_target_date"
          UNIQUE ("tenant_id", "target_tenant_id", "snapshot_date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_health_snapshots_date" ON "health_snapshots" ("tenant_id", "snapshot_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "health_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "health_signals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_health_scores"`);
  }
}
