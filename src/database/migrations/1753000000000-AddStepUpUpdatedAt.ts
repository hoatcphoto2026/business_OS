import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStepUpUpdatedAt1753000000000 implements MigrationInterface {
  name = 'AddStepUpUpdatedAt1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // BaseEntity expects updated_at; original migration only created created_at
    await queryRunner.query(`
      ALTER TABLE "step_up_sessions"
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "step_up_sessions" DROP COLUMN IF EXISTS "updated_at"`);
  }
}
