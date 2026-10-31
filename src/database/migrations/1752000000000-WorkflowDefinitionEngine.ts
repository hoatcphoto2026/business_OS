import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkflowDefinitionEngine1752000000000 implements MigrationInterface {
  name = 'WorkflowDefinitionEngine1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(100) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "type" varchar(30) NOT NULL DEFAULT 'MANUAL',
        "version" int NOT NULL DEFAULT 1,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "config" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_workflow_definitions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wf_def_tenant_code_ver" ON "workflow_definitions" ("tenant_id", "code", "version")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_nodes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "definition_id" uuid NOT NULL,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "node_type" varchar(20) NOT NULL DEFAULT 'ACTION',
        "action_type" varchar(40),
        "config" jsonb NOT NULL DEFAULT '{}',
        "is_start" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_workflow_nodes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_nodes_definition" FOREIGN KEY ("definition_id")
          REFERENCES "workflow_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wf_nodes_def" ON "workflow_nodes" ("definition_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_transitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "definition_id" uuid NOT NULL,
        "from_node_id" uuid NOT NULL,
        "to_node_id" uuid NOT NULL,
        "condition" varchar(255),
        CONSTRAINT "PK_workflow_transitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trans_definition" FOREIGN KEY ("definition_id")
          REFERENCES "workflow_definitions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_trans_from" FOREIGN KEY ("from_node_id")
          REFERENCES "workflow_nodes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_trans_to" FOREIGN KEY ("to_node_id")
          REFERENCES "workflow_nodes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wf_trans_def" ON "workflow_transitions" ("definition_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "definition_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "started_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "retry_count" int NOT NULL DEFAULT 0,
        "error_message" text,
        "input" jsonb NOT NULL DEFAULT '{}',
        "output" jsonb NOT NULL DEFAULT '{}',
        "current_node_code" varchar(50),
        CONSTRAINT "PK_workflow_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_exec_definition" FOREIGN KEY ("definition_id")
          REFERENCES "workflow_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wf_exec_tenant_status" ON "workflow_executions" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wf_exec_def" ON "workflow_executions" ("definition_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_executions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_transitions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_nodes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_definitions"`);
  }
}
