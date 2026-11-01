import { DataSource } from 'typeorm';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';

/**
 * D8 – seed warehouse dimensions (date spine + plans + tenants + org/dept).
 * Facts are produced by the ETL endpoint; dimensions must exist right after
 * `npm run seed` so `/warehouse/dimensions` and `/warehouse/overview` work.
 */
export async function seedWarehouseDimensions(
  dataSource: DataSource,
): Promise<void> {
  const tenant = await dataSource
    .getRepository(Tenant)
    .findOne({ where: { code: 'ABC' } });
  if (!tenant) return;

  const owner = tenant.id;
  const [dates] = await dataSource.query(
    `WITH inserted AS (
       INSERT INTO warehouse_dim_dates
         (id, tenant_id, date_key, calendar_date, year, quarter, month, month_name,
          week_of_year, day_of_week, day_name, is_weekend, created_at, updated_at)
       SELECT gen_random_uuid(), $1, to_char(d, 'YYYYMMDD')::int, d::date,
              EXTRACT(YEAR FROM d)::int, EXTRACT(QUARTER FROM d)::int,
              EXTRACT(MONTH FROM d)::int, to_char(d, 'Mon'),
              EXTRACT(WEEK FROM d)::int, EXTRACT(DOW FROM d)::int,
              to_char(d, 'Dy'), EXTRACT(DOW FROM d) IN (0, 6), now(), now()
         FROM generate_series(
                CURRENT_DATE - interval '400 days',
                CURRENT_DATE + interval '30 days',
                interval '1 day') AS d
       ON CONFLICT (tenant_id, date_key) DO NOTHING
       RETURNING 1
     )
     SELECT COUNT(*)::int AS created FROM inserted`,
    [owner],
  );

  const [plans] = await dataSource.query(
    `WITH inserted AS (
       INSERT INTO warehouse_dim_plans
         (id, tenant_id, plan_code, name, monthly_price, yearly_price, currency,
          is_active, created_at, updated_at)
       SELECT gen_random_uuid(), $1, p.code::text, p.name, p.monthly_price,
              p.yearly_price, p.currency, p.is_active, now(), now()
         FROM plans p
       ON CONFLICT (tenant_id, plan_code) DO NOTHING
       RETURNING 1
     )
     SELECT COUNT(*)::int AS created FROM inserted`,
    [owner],
  );

  const [tenants] = await dataSource.query(
    `WITH inserted AS (
       INSERT INTO warehouse_dim_tenants
         (id, tenant_id, source_tenant_id, code, name, plan_code, status, country,
          source_updated_at, created_at, updated_at)
       SELECT gen_random_uuid(), $1, t.id, t.code, t.name, t.plan::text,
              t.status::text, t.settings->>'country', t.updated_at, now(), now()
         FROM tenants t
       ON CONFLICT (tenant_id, source_tenant_id) DO NOTHING
       RETURNING 1
     )
     SELECT COUNT(*)::int AS created FROM inserted`,
    [owner],
  );

  const [organizations] = await dataSource.query(
    `WITH inserted AS (
       INSERT INTO warehouse_dim_organizations
         (id, tenant_id, source_organization_id, source_tenant_id, code, name,
          status, created_at, updated_at)
       SELECT gen_random_uuid(), $1, c.id, c.tenant_id, c.code, c.name,
              c.status::text, now(), now()
         FROM companies c
       ON CONFLICT (tenant_id, source_organization_id) DO NOTHING
       RETURNING 1
     )
     SELECT COUNT(*)::int AS created FROM inserted`,
    [owner],
  );

  const [departments] = await dataSource.query(
    `WITH inserted AS (
       INSERT INTO warehouse_dim_departments
         (id, tenant_id, source_department_id, source_organization_id,
          source_tenant_id, code, name, status, created_at, updated_at)
       SELECT gen_random_uuid(), $1, d.id, d.company_id, d.tenant_id, d.code,
              d.name, d.status::text, now(), now()
         FROM departments d
       ON CONFLICT (tenant_id, source_department_id) DO NOTHING
       RETURNING 1
     )
     SELECT COUNT(*)::int AS created FROM inserted`,
    [owner],
  );

  console.log(
    `✅ Warehouse seeder completed (operator tenant ABC, dates +${dates.created}, ` +
      `plans +${plans.created}, tenants +${tenants.created}, ` +
      `organizations +${organizations.created}, departments +${departments.created})`,
  );
}
