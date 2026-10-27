import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticsPlatform173B000000000 implements MigrationInterface {
  name = 'LogisticsPlatform173B000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "carriers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_carriers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carriers_code" UNIQUE ("code")
      )
    `);

    // Seed carriers
    await queryRunner.query(`
      INSERT INTO "carriers" (code, name) VALUES
        ('GHN', 'Giao Hàng Nhanh'),
        ('GHTK', 'Giao Hàng Tiết Kiệm'),
        ('VIETTEL_POST', 'Viettel Post'),
        ('JNT', 'J&T Express'),
        ('NINJA_VAN', 'Ninja Van'),
        ('LALAMOVE', 'Lalamove'),
        ('AHAMOVE', 'Ahamove'),
        ('DHL', 'DHL'),
        ('FEDEX', 'FedEx'),
        ('UPS', 'UPS')
      ON CONFLICT (code) DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "company_id" uuid,
        "branch_id" uuid,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "sales_order_id" uuid,
        "shipping_no" varchar(50),
        "carrier_code" varchar(50),
        "recipient_name" varchar(255) NOT NULL,
        "recipient_phone" varchar(30),
        "recipient_address" text NOT NULL,
        "shipping_fee" decimal(18,2) NOT NULL DEFAULT 0,
        "cod_amount" decimal(18,2) NOT NULL DEFAULT 0,
        "status" varchar(30) NOT NULL DEFAULT 'CREATED',
        "notes" text,
        CONSTRAINT "PK_delivery_orders" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_delivery_orders_tenant" ON "delivery_orders" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_delivery_orders_shipping" ON "delivery_orders" ("shipping_no")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_tracking_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "delivery_order_id" uuid NOT NULL,
        "status" varchar(30) NOT NULL,
        "description" text,
        "location" varchar(255),
        CONSTRAINT "PK_delivery_tracking_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tracking_delivery" ON "delivery_tracking_events" ("delivery_order_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cod_settlements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "delivery_order_id" uuid NOT NULL,
        "carrier" varchar(50) NOT NULL,
        "cod_amount" decimal(18,2) NOT NULL,
        "settlement_date" date,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        CONSTRAINT "PK_cod_settlements" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cod_settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_tracking_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carriers"`);
  }
}
