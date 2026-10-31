import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnterpriseOrganization1762000000000 implements MigrationInterface {
  name = 'EnterpriseOrganization1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enterprise_organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "parent_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_enterprise_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_enterprise_org_tenant_code" UNIQUE ("tenant_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enterprise_departments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "parent_id" uuid,
        "manager_id" uuid,
        "cost_center_id" uuid,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_enterprise_departments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_enterprise_dept_org_code" UNIQUE ("tenant_id", "organization_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enterprise_teams" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "department_id" uuid NOT NULL,
        "parent_id" uuid,
        "lead_id" uuid,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_enterprise_teams" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_enterprise_team_dept_code" UNIQUE ("tenant_id", "department_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cost_centers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "department_id" uuid,
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_cost_centers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cost_center_org_code" UNIQUE ("tenant_id", "organization_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "org_memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "department_id" uuid,
        "team_id" uuid,
        "role" varchar(40) NOT NULL,
        CONSTRAINT "PK_org_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_org_membership_user" UNIQUE ("tenant_id", "organization_id", "user_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "org_memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cost_centers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprise_teams"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprise_departments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enterprise_organizations"`);
  }
}
