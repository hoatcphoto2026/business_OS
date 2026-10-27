import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowEngine1734000000000 implements MigrationInterface {
  name = 'CreateWorkflowEngine1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workflow_instances" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"       uuid NOT NULL,
        "company_id"      uuid,
        "branch_id"       uuid,
        "entity_type"     varchar(100) NOT NULL,
        "entity_id"       uuid NOT NULL,
        "current_status"  varchar(30) NOT NULL DEFAULT 'DRAFT',
        "created_by"      uuid,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_workflow_instances_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workflow_instances_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_workflow_instances_branch"
          FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_workflow_instances_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_workflow_instances_entity"
          UNIQUE ("tenant_id", "entity_type", "entity_id")
      );

      CREATE INDEX "IDX_workflow_instances_tenant" ON "workflow_instances" ("tenant_id");
      CREATE INDEX "IDX_workflow_instances_entity" ON "workflow_instances" ("entity_type", "entity_id");
      CREATE INDEX "IDX_workflow_instances_status" ON "workflow_instances" ("current_status");

      CREATE TABLE "workflow_histories" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workflow_instance_id"  uuid NOT NULL,
        "from_status"           varchar(30),
        "to_status"             varchar(30) NOT NULL,
        "action"                varchar(30) NOT NULL,
        "comment"               text,
        "performed_by"          uuid,
        "performed_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_workflow_histories_instance"
          FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workflow_histories_performed_by"
          FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL
      );

      CREATE INDEX "IDX_workflow_histories_instance" ON "workflow_histories" ("workflow_instance_id");
      CREATE INDEX "IDX_workflow_histories_performed_at" ON "workflow_histories" ("performed_at");

      -- Align sales_orders.status with generic WorkflowStatus (varchar)
      -- Previous enum was sales_order_status_enum ('draft', 'confirmed', ...)
      ALTER TABLE "sales_orders"
        ALTER COLUMN "status" TYPE varchar(30)
        USING "status"::text;

      ALTER TABLE "sales_orders"
        ALTER COLUMN "status" SET DEFAULT 'DRAFT';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "workflow_histories";
      DROP TABLE IF EXISTS "workflow_instances";
    `);
  }
}
