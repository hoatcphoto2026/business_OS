import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComplianceCenter1766000000000 implements MigrationInterface {
  name = 'ComplianceCenter1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_evidence" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(60) NOT NULL,
        "title" varchar(255) NOT NULL,
        "category" varchar(40) NOT NULL,
        "source" varchar(20) NOT NULL DEFAULT 'MANUAL',
        "status" varchar(20) NOT NULL DEFAULT 'COLLECTED',
        "collected_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "valid_until" TIMESTAMPTZ,
        "hash" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "notes" text,
        CONSTRAINT "PK_compliance_evidence" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_compliance_evidence_tenant_code" ON "compliance_evidence" ("tenant_id", "code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_evidence_category" ON "compliance_evidence" ("tenant_id", "category")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_access_reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "scope" varchar(20) NOT NULL DEFAULT 'ALL_USERS',
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "period_start" TIMESTAMPTZ,
        "period_end" TIMESTAMPTZ,
        "reviewer_id" uuid,
        "findings" jsonb NOT NULL DEFAULT '[]',
        "reviewed_count" int NOT NULL DEFAULT 0,
        "flagged_count" int NOT NULL DEFAULT 0,
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_compliance_access_reviews" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_reviews_status" ON "compliance_access_reviews" ("tenant_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_risks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "title" varchar(255) NOT NULL,
        "category" varchar(40) NOT NULL,
        "description" text,
        "severity" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'OPEN',
        "likelihood" int NOT NULL DEFAULT 3,
        "impact" int NOT NULL DEFAULT 3,
        "score" int NOT NULL DEFAULT 9,
        "owner_id" uuid,
        "due_at" TIMESTAMPTZ,
        "mitigation" text,
        "assessed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compliance_risks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_risks_status" ON "compliance_risks" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_risks_severity" ON "compliance_risks" ("tenant_id", "severity")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "period_start" TIMESTAMPTZ,
        "period_end" TIMESTAMPTZ,
        "evidence_score" int NOT NULL DEFAULT 0,
        "access_score" int NOT NULL DEFAULT 0,
        "risk_score" int NOT NULL DEFAULT 0,
        "retention_score" int NOT NULL DEFAULT 0,
        "security_score" int NOT NULL DEFAULT 0,
        "overall_score" int NOT NULL DEFAULT 0,
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compliance_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_snapshots_generated" ON "compliance_snapshots" ("tenant_id", "generated_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "compliance_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "compliance_risks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "compliance_access_reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "compliance_evidence"`);
  }
}
