import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCopilotLogs1737000000000 implements MigrationInterface {
  name = 'CreateCopilotLogs1737000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "copilot_logs" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "user_id"     uuid,
        "question"    text NOT NULL,
        "intent"      varchar(100),
        "response"    jsonb,
        "tokens"      int NOT NULL DEFAULT 0,
        "provider"    varchar(30),
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_copilot_logs_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_copilot_logs_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      );

      CREATE INDEX "IDX_copilot_logs_tenant" ON "copilot_logs" ("tenant_id");
      CREATE INDEX "IDX_copilot_logs_user" ON "copilot_logs" ("user_id");
      CREATE INDEX "IDX_copilot_logs_created_at" ON "copilot_logs" ("created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "copilot_logs";`);
  }
}
