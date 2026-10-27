import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1733000000000 implements MigrationInterface {
  name = 'CreateAuditLogs1733000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"     uuid NOT NULL,
        "company_id"    uuid,
        "branch_id"     uuid,
        "entity_type"   varchar(100) NOT NULL,
        "entity_id"     uuid,
        "action"        varchar(30) NOT NULL,
        "old_data"      jsonb,
        "new_data"      jsonb,
        "performed_by"  uuid,
        "owner_id"      uuid,
        "ip_address"    varchar(64),
        "user_agent"    text,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_audit_logs_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_audit_logs_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_audit_logs_branch"
          FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_audit_logs_performed_by"
          FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_tenant" ON "audit_logs" ("tenant_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_performed_by" ON "audit_logs" ("performed_by");`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action");`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at");`,
    );
    // Scope + copilot history. Not a substitute for the indexes above.
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_tenant_owner" ON "audit_logs" ("tenant_id", "owner_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_history" ON "audit_logs" ("tenant_id", "entity_type", "entity_id", "created_at");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs";`);
  }
}
