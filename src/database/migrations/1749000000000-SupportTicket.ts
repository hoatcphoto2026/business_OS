import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTicket1749000000000 implements MigrationInterface {
  name = 'SupportTicket1749000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_tickets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "subject" varchar(255) NOT NULL,
        "description" text,
        "status" varchar(30) NOT NULL DEFAULT 'OPEN',
        "priority" varchar(20) NOT NULL DEFAULT 'MEDIUM',
        "requester_id" uuid NOT NULL,
        "assignee_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tickets_tenant_status" ON "support_tickets" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tickets_tenant_priority" ON "support_tickets" ("tenant_id", "priority")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tickets_requester" ON "support_tickets" ("requester_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ticket_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "ticket_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "body" text NOT NULL,
        "is_internal" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_ticket_comments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_comments_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "support_tickets"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_comments_ticket" ON "ticket_comments" ("ticket_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ticket_attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "ticket_id" uuid NOT NULL,
        "filename" varchar(255) NOT NULL,
        "content_type" varchar(100),
        "size_bytes" int NOT NULL DEFAULT 0,
        "url" varchar(500) NOT NULL,
        "uploaded_by" uuid NOT NULL,
        CONSTRAINT "PK_ticket_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attachments_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "support_tickets"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_attachments_ticket" ON "ticket_attachments" ("ticket_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_attachments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
  }
}
