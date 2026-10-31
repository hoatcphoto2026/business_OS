import { MigrationInterface, QueryRunner } from 'typeorm';

export class RuleEngine1755000000000 implements MigrationInterface {
  name = 'RuleEngine1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rule_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(100) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "version" int NOT NULL DEFAULT 1,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "config" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_rule_definitions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_rules_tenant_code_ver" ON "rule_definitions" ("tenant_id", "code", "version")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rule_conditions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "rule_id" uuid NOT NULL,
        "condition_type" varchar(40) NOT NULL,
        "operator" varchar(5) NOT NULL DEFAULT '>',
        "value" varchar(255) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        CONSTRAINT "PK_rule_conditions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cond_rule" FOREIGN KEY ("rule_id")
          REFERENCES "rule_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cond_rule" ON "rule_conditions" ("rule_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rule_actions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "rule_id" uuid NOT NULL,
        "action_type" varchar(40) NOT NULL,
        "config" jsonb NOT NULL DEFAULT '{}',
        "sort_order" int NOT NULL DEFAULT 0,
        CONSTRAINT "PK_rule_actions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_action_rule" FOREIGN KEY ("rule_id")
          REFERENCES "rule_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_action_rule" ON "rule_actions" ("rule_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rule_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "rule_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'NOT_MATCHED',
        "evaluated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "input" jsonb NOT NULL DEFAULT '{}',
        "result" jsonb NOT NULL DEFAULT '{}',
        "error_message" text,
        CONSTRAINT "PK_rule_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_exec_rule" FOREIGN KEY ("rule_id")
          REFERENCES "rule_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_exec_rule_status" ON "rule_executions" ("rule_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_exec_tenant_eval" ON "rule_executions" ("tenant_id", "evaluated_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rule_executions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rule_actions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rule_conditions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rule_definitions"`);
  }
}
