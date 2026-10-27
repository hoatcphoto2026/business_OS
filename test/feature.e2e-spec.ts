/**
 * Sprint 8 – Feature Toggle Platform (e2e)
 *
 * Prerequisites:
 *   npm run migration:run
 *   npm run seed
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { EventBus } from '../src/modules/event/event-bus.service';
import { EventType } from '../src/modules/event/enums/event-type.enum';

describe('Feature Toggle platform (e2e)', () => {
  let app: INestApplication;
  let salesToken: string;
  let adminToken: string;
  let cafeToken: string;
  let abcTenantId: string;
  let eventBus: EventBus;

  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    eventBus = app.get(EventBus);

    const login = async (email: string, tenant: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD, tenant })
        .expect(200);
      return res.body;
    };

    const sales = await login('hcm.user@abctrading.vn', 'ABC');
    const admin = await login('admin@abctrading.vn', 'ABC');
    const cafe = await login('owner@cafemoc.vn', 'CAFE_MOC');

    salesToken = sales.accessToken;
    adminToken = admin.accessToken;
    cafeToken = cafe.accessToken;
    abcTenantId = sales.tenant?.id ?? sales.user?.tenantId;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('CASE 1: Accounting disabled → 403', async () => {
    // Ensure disabled
    await request(app.getHttpServer())
      .post('/tenant-features/accounting/disable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/accounting/reports')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
  });

  it('CASE 2 + 3 + 4: Enable Accounting → 200 + FeatureEnabled event + Audit', async () => {
    await request(app.getHttpServer())
      .post('/tenant-features/accounting/enable')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/accounting/reports')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);

    // Event log
    const events = await eventBus.query({
      eventType: EventType.FeatureEnabled,
      tenantId: abcTenantId,
    });
    const accountingEvents = events.filter(
      (e) => (e.payload as any)?.featureCode === 'accounting',
    );
    expect(accountingEvents.length).toBeGreaterThanOrEqual(1);

    // Audit log
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ entity_type: 'feature' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const enableAudits = (audit.body as any[]).filter(
      (a) => a.newData?.action === 'ENABLE' && a.newData?.featureCode === 'accounting',
    );
    expect(enableAudits.length).toBeGreaterThanOrEqual(1);
  });

  it('CASE 5: Cross tenant – enabling on ABC does not enable on Cafe', async () => {
    // ABC has accounting enabled from previous test
    await request(app.getHttpServer())
      .get('/accounting/reports')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);

    // Cafe should still be disabled (Starter plan)
    await request(app.getHttpServer())
      .get('/accounting/reports')
      .set('Authorization', `Bearer ${cafeToken}`)
      .expect(403);
  });
});
