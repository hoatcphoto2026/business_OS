import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1747000000000 implements MigrationInterface {
  name = 'CreatePayments1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_methods" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "provider"    varchar(30) NOT NULL,
        "external_id" varchar(255),
        "label"       varchar(100),
        "is_default"  boolean NOT NULL DEFAULT false,
        "metadata"    jsonb NOT NULL DEFAULT '{}',
        "created_by"  uuid,
        "updated_by"  uuid,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payment_methods_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_payment_methods_tenant_provider"
        ON "payment_methods" ("tenant_id", "provider");

      CREATE TABLE "payment_transactions" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"        uuid NOT NULL,
        "invoice_id"       uuid,
        "provider"         varchar(30) NOT NULL,
        "status"           varchar(30) NOT NULL DEFAULT 'PENDING',
        "amount"           numeric(14,2) NOT NULL,
        "currency"         varchar(3) NOT NULL DEFAULT 'VND',
        "idempotency_key"  varchar(100) NOT NULL UNIQUE,
        "external_id"      varchar(255),
        "provider_ref"     varchar(255),
        "failure_reason"   text,
        "retry_count"      int NOT NULL DEFAULT 0,
        "metadata"         jsonb NOT NULL DEFAULT '{}',
        "processed_at"     TIMESTAMPTZ,
        "created_by"       uuid,
        "updated_by"       uuid,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payment_transactions_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_payment_transactions_tenant_status"
        ON "payment_transactions" ("tenant_id", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "payment_transactions";
      DROP TABLE IF EXISTS "payment_methods";
    `);
  }
}
