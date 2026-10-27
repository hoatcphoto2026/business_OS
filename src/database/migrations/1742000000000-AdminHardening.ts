import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 hardening for Administration Center:
 * - token_version on users (immediate JWT revocation)
 * - admin.access permission, granted to owner and admin roles
 */
export class AdminHardening1742000000000 implements MigrationInterface {
  name = 'AdminHardening1742000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "token_version" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("module", "action", "code", "description")
      SELECT 'admin', 'access', 'admin.access', 'Access Administration Center'
      WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'admin.access')
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.code IN ('owner', 'admin')
        AND p.code = 'admin.access'
        AND NOT EXISTS (
          SELECT 1 FROM "role_permissions" rp
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (SELECT id FROM "permissions" WHERE "code" = 'admin.access')
    `);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'admin.access'`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "token_version"`);
  }
}
