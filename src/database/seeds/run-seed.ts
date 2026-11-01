import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { seedTenants } from './tenant.seeder';
import { seedOrganization } from './organization.seeder';
import { seedRbac } from './rbac.seeder';
import { seedScopes } from './scope.seeder';
import { seedFeatures } from './feature.seeder';
import { seedLogistics } from './logistics.seeder';
import { seedPlans, seedDemoSubscriptions } from './billing.seeder';
import { seedSecurityAlertRules } from './security.seeder';
import { seedReportSchedules } from './reporting.seeder';
import { seedExecutiveMetrics } from './executive.seeder';
import { seedRevenueSnapshot } from './revenue.seeder';
import { seedHealthSignals } from './health.seeder';
import { seedProductAnalytics } from './product-analytics.seeder';
import { seedGrowthSnapshot } from './growth.seeder';
import { seedForecastModels } from './forecast.seeder';
import { seedWarehouseDimensions } from './warehouse.seeder';
import { seedMasterDataDefaults } from '../../modules/master-data/master-data.seeder';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';

config();

async function run() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'business_os',
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    synchronize: false,
  });

  await dataSource.initialize();
  try {
    await seedTenants(dataSource);
    await seedOrganization(dataSource);
    await seedRbac(dataSource);

    // Seed scopes for demo tenant ABC
    const tenantRepo = dataSource.getRepository(Tenant);
    const tenantA = await tenantRepo.findOne({ where: { code: 'ABC' } });
    if (tenantA) {
      await seedScopes(dataSource, tenantA.id);
    }
    const tenantB = await tenantRepo.findOne({ where: { code: 'CAFE_MOC' } });
    if (tenantB) {
      await seedScopes(dataSource, tenantB.id);
    }

    await seedFeatures(dataSource);
    await seedPlans(dataSource);
    await seedDemoSubscriptions(dataSource);

    // Phase 2: Seed Master Data defaults for demo tenants
    if (tenantA) {
      const rA = await seedMasterDataDefaults(dataSource, tenantA.id);
      console.log('Master Data seeded for ABC:', rA);
    }
    if (tenantB) {
      const rB = await seedMasterDataDefaults(dataSource, tenantB.id);
      console.log('Master Data seeded for Cafe Mộc:', rB);
    }

    await seedLogistics(dataSource);
    await seedSecurityAlertRules(dataSource);
    await seedReportSchedules(dataSource);
    await seedExecutiveMetrics(dataSource);
    await seedRevenueSnapshot(dataSource);
    await seedHealthSignals(dataSource);
    await seedProductAnalytics(dataSource);
    await seedGrowthSnapshot(dataSource);
    await seedForecastModels(dataSource);
    await seedWarehouseDimensions(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

run().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
