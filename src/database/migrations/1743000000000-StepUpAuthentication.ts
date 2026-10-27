import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 – Step-Up Authentication for Administration Center
 * - step_up_sessions table
 * - totp fields on users
 */
export class StepUpAuthentication1743000000000 implements MigrationInterface {
  name = 'StepUpAuthentication1743000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "step_up_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "action" varchar(64) NOT NULL,
        "method" varchar(16) NOT NULL,
        "challenge_hash" varchar(128),
        "expires_at" timestamptz NOT NULL,
        "verified_at" timestamptz,
        "consumed_at" timestamptz,
        "ip_address" varchar(45),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_step_up_sessions_user_action"
      ON "step_up_sessions" ("tenant_id", "user_id", "action", "expires_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "totp_secret_encrypted" text,
      ADD COLUMN IF NOT EXISTS "totp_enabled" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "step_up_sessions"`);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "totp_secret_encrypted",
      DROP COLUMN IF EXISTS "totp_enabled"
    `);
  }
}
