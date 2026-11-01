import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnterpriseSecurity1767000000000 implements MigrationInterface {
  name = 'EnterpriseSecurity1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "event_type" varchar(60) NOT NULL,
        "severity" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'OPEN',
        "source" varchar(20) NOT NULL DEFAULT 'SYSTEM',
        "user_id" uuid,
        "actor_email" varchar(255),
        "ip_address" varchar(64),
        "user_agent" text,
        "country" varchar(2),
        "city" varchar(100),
        "risk_score" int NOT NULL DEFAULT 0,
        "dedupe_key" varchar(160),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "detected_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "acknowledged_at" TIMESTAMPTZ,
        "acknowledged_by" uuid,
        "resolved_at" TIMESTAMPTZ,
        "resolved_by" uuid,
        "resolution_notes" text,
        CONSTRAINT "PK_security_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_events_type" ON "security_events" ("tenant_id", "event_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_events_status" ON "security_events" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_events_detected" ON "security_events" ("tenant_id", "detected_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_login_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid,
        "user_id" uuid,
        "email" varchar(255) NOT NULL,
        "success" boolean NOT NULL,
        "anomalous" boolean NOT NULL DEFAULT false,
        "reason" varchar(40) NOT NULL DEFAULT 'OK',
        "ip_address" varchar(64),
        "user_agent" text,
        "country" varchar(2),
        "city" varchar(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_security_login_attempts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_login_attempts_tenant_email" ON "security_login_attempts" ("tenant_id", "email", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_login_attempts_success" ON "security_login_attempts" ("success", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_login_attempts_anomalous" ON "security_login_attempts" ("tenant_id", "anomalous", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_login_locations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "country" varchar(2) NOT NULL,
        "city" varchar(100),
        "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "hits" int NOT NULL DEFAULT 1,
        CONSTRAINT "PK_security_login_locations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_security_login_locations" UNIQUE ("tenant_id", "user_id", "country")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_login_locations_user" ON "security_login_locations" ("tenant_id", "user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_alert_rules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "event_type" varchar(60) NOT NULL,
        "threshold" int NOT NULL DEFAULT 5,
        "window_minutes" int NOT NULL DEFAULT 15,
        "severity" varchar(20) NOT NULL DEFAULT 'HIGH',
        "channels" jsonb NOT NULL DEFAULT '[]',
        "enabled" boolean NOT NULL DEFAULT true,
        "trigger_count" int NOT NULL DEFAULT 0,
        "last_triggered_at" TIMESTAMPTZ,
        CONSTRAINT "PK_security_alert_rules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_security_alert_rules_tenant_name" UNIQUE ("tenant_id", "name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_secret_rotations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "resource_type" varchar(40) NOT NULL,
        "resource_id" varchar(64) NOT NULL,
        "resource_name" varchar(255),
        "reason" varchar(255),
        "rotated_by" uuid,
        "rotated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_security_secret_rotations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_rotations_type" ON "security_secret_rotations" ("tenant_id", "resource_type")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_emergency_access" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "requester_id" uuid NOT NULL,
        "approver_id" uuid,
        "reason" text NOT NULL,
        "scope" varchar(60) NOT NULL DEFAULT 'TENANT_ADMIN',
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMPTZ NOT NULL,
        "approved_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_security_emergency_access" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_security_emergency_status" ON "security_emergency_access" ("tenant_id", "status")`,
    );

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "security_emergency_access"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_secret_rotations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_alert_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_login_locations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_login_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_events"`);
  }
}

