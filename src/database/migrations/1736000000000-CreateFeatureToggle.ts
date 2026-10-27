import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeatureToggle1736000000000 implements MigrationInterface {
  name = 'CreateFeatureToggle1736000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "features" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"        varchar(50) NOT NULL UNIQUE,
        "name"        varchar(150) NOT NULL,
        "description" text,
        "category"    varchar(50),
        "status"      varchar(20) NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE "tenant_features" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   uuid NOT NULL,
        "feature_id"  uuid NOT NULL,
        "enabled"     boolean NOT NULL DEFAULT false,
        "enabled_at"  TIMESTAMPTZ,
        "enabled_by"  uuid,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_tenant_features_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_features_feature"
          FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_features_enabled_by"
          FOREIGN KEY ("enabled_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_tenant_features"
          UNIQUE ("tenant_id", "feature_id")
      );

      CREATE INDEX "IDX_tenant_features_tenant" ON "tenant_features" ("tenant_id");
      CREATE INDEX "IDX_tenant_features_feature" ON "tenant_features" ("feature_id");
      CREATE INDEX "IDX_tenant_features_enabled" ON "tenant_features" ("tenant_id", "enabled");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "tenant_features";
      DROP TABLE IF EXISTS "features";
    `);
  }
}
