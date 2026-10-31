import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnterpriseIdentity1763000000000 implements MigrationInterface {
  name = 'EnterpriseIdentity1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "identity_providers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "type" varchar(20) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "issuer" varchar(500) NOT NULL,
        "client_id" varchar(255) NOT NULL,
        "client_secret" varchar(500) NOT NULL,
        "entra_tenant_id" varchar(100),
        "redirect_uri" varchar(500) NOT NULL,
        "default_role" varchar(50) NOT NULL DEFAULT 'member',
        "rbac_role_code" varchar(50),
        "saml_entity_id" varchar(500),
        "saml_acs_url" varchar(500),
        CONSTRAINT "PK_identity_providers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_identity_provider_tenant_code" UNIQUE ("tenant_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "identity_mappings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "provider_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "external_subject" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        CONSTRAINT "PK_identity_mappings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_identity_mapping_subject" UNIQUE ("provider_id", "external_subject")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sso_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "provider_id" uuid NOT NULL,
        "user_id" uuid,
        "state" varchar(128) NOT NULL,
        "nonce" varchar(128) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "external_subject" varchar(255),
        "trace_id" varchar(128),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "authenticated_at" TIMESTAMPTZ,
        "ended_at" TIMESTAMPTZ,
        CONSTRAINT "PK_sso_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sso_sessions_state" UNIQUE ("state")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sso_sessions_tenant" ON "sso_sessions" ("tenant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sso_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "identity_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "identity_providers"`);
  }
}
