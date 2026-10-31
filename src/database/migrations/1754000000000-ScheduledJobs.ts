import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduledJobs1754000000000 implements MigrationInterface {
  name = 'ScheduledJobs1754000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "job_type" varchar(40) NOT NULL,
        "schedule_type" varchar(20) NOT NULL DEFAULT 'DAILY',
        "cron_expression" varchar(100),
        "is_enabled" boolean NOT NULL DEFAULT true,
        "max_retries" int NOT NULL DEFAULT 3,
        "last_run_at" TIMESTAMPTZ,
        "next_run_at" TIMESTAMPTZ,
        "config" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_scheduled_jobs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_jobs_tenant_type" ON "scheduled_jobs" ("tenant_id", "job_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_jobs_tenant_enabled" ON "scheduled_jobs" ("tenant_id", "is_enabled")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_execution_histories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "job_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "started_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "retry_count" int NOT NULL DEFAULT 0,
        "error_message" text,
        "result" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_job_execution_histories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_job_exec_job" FOREIGN KEY ("job_id")
          REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_job_exec_job_status" ON "job_execution_histories" ("job_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_job_exec_tenant_started" ON "job_execution_histories" ("tenant_id", "started_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_execution_histories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_jobs"`);
  }
}
