import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoPkce1765000000000 implements MigrationInterface {
  name = 'SsoPkce1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sso_sessions" ADD COLUMN IF NOT EXISTS "code_verifier" varchar(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sso_sessions" ADD COLUMN IF NOT EXISTS "code_challenge" varchar(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sso_sessions" ADD COLUMN IF NOT EXISTS "code_challenge_method" varchar(10)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sso_sessions" DROP COLUMN IF EXISTS "code_challenge_method"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sso_sessions" DROP COLUMN IF EXISTS "code_challenge"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sso_sessions" DROP COLUMN IF EXISTS "code_verifier"`,
    );
  }
}
