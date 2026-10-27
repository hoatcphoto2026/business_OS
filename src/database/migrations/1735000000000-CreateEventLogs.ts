import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventLogs1735000000000 implements MigrationInterface {
  name = 'CreateEventLogs1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "event_logs" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"       uuid NOT NULL,
        "event_type"      varchar(100) NOT NULL,
        "aggregate_type"  varchar(100) NOT NULL,
        "aggregate_id"    uuid NOT NULL,
        "payload"         jsonb,
        "company_id"      uuid,
        "branch_id"       uuid,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_event_logs_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_event_logs_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_event_logs_branch"
          FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      );

      CREATE INDEX "IDX_event_logs_tenant" ON "event_logs" ("tenant_id");
      CREATE INDEX "IDX_event_logs_type" ON "event_logs" ("event_type");
      CREATE INDEX "IDX_event_logs_aggregate" ON "event_logs" ("aggregate_type", "aggregate_id");
      CREATE INDEX "IDX_event_logs_created_at" ON "event_logs" ("created_at");
      CREATE INDEX "IDX_event_logs_tenant_type_time" ON "event_logs" ("tenant_id", "event_type", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "event_logs";`);
  }
}
