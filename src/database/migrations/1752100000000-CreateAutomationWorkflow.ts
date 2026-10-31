import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAutomationWorkflow1752100000000 implements MigrationInterface {
  name = 'CreateAutomationWorkflow1752100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "automation_workflow_definitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text,
        "trigger_event" varchar(100) NOT NULL,
        "conditions" jsonb,
        "steps" jsonb NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_workflow_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_automation_workflow_definitions_tenant_name" UNIQUE ("tenant_id", "name")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_automation_workflow_definitions_tenant_trigger_status"
      ON "automation_workflow_definitions" ("tenant_id", "trigger_event", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "automation_workflow_instances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "definition_id" uuid NOT NULL,
        "trigger_event" varchar(100) NOT NULL,
        "aggregate_type" varchar(100),
        "aggregate_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "current_step_index" integer NOT NULL DEFAULT 0,
        "context" jsonb,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_workflow_instances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_automation_workflow_instances_definition"
          FOREIGN KEY ("definition_id") REFERENCES "automation_workflow_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_automation_workflow_instances_tenant_definition"
      ON "automation_workflow_instances" ("tenant_id", "definition_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_automation_workflow_instances_tenant_status"
      ON "automation_workflow_instances" ("tenant_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "automation_workflow_executions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "instance_id" uuid NOT NULL,
        "step_index" integer NOT NULL,
        "step_type" varchar(50) NOT NULL,
        "step_config" jsonb,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "input" jsonb,
        "output" jsonb,
        "error" text,
        "executed_at" timestamptz,
        "duration_ms" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_workflow_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_automation_workflow_executions_instance"
          FOREIGN KEY ("instance_id") REFERENCES "automation_workflow_instances"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_automation_workflow_executions_instance_step"
      ON "automation_workflow_executions" ("instance_id", "step_index")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "automation_workflow_executions"`);
    await queryRunner.query(`DROP TABLE "automation_workflow_instances"`);
    await queryRunner.query(`DROP TABLE "automation_workflow_definitions"`);
  }
}
