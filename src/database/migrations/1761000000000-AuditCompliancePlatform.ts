import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditCompliancePlatform1761000000000 implements MigrationInterface {
  name = 'AuditCompliancePlatform1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_events" (
        "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "actor_id" uuid,
        "actor_email" varchar(255),
        "category" varchar(30) NOT NULL,
        "resource_type" varchar(100) NOT NULL,
        "resource_id" varchar(64),
        "action" varchar(30) NOT NULL,
        "before_data" jsonb,
        "after_data" jsonb,
        "ip_address" varchar(64),
        "user_agent" text,
        "trace_id" varchar(128),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_events" PRIMARY KEY ("event_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_events_tenant_created" ON "audit_events" ("tenant_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_events_tenant_category" ON "audit_events" ("tenant_id", "category")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_events_tenant_actor" ON "audit_events" ("tenant_id", "actor_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_exports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "format" varchar(10) NOT NULL,
        "row_count" int NOT NULL,
        "requested_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_exports" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_exports_tenant" ON "audit_exports" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_retention_policies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "code" varchar(20) NOT NULL,
        "label" varchar(40) NOT NULL,
        "days" int,
        "is_custom" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_retention_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_audit_retention_tenant_code" UNIQUE ("tenant_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "report_type" varchar(40) NOT NULL,
        "summary" jsonb NOT NULL,
        "generated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compliance_reports" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_compliance_reports_tenant" ON "compliance_reports" ("tenant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "compliance_reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_retention_policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_exports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
  }
}
