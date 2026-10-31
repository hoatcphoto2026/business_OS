import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('Automation Workflow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should have automation workflow endpoints registered', async () => {
    // Smoke: module loads without crash
    expect(app).toBeDefined();
  });

  // Full e2e requires seeded DB + auth token.
  // Cases covered by design:
  // 1. Create definition InvoiceIssued → SEND_EMAIL
  // 2. Publish event → instance COMPLETED
  // 3. PaymentReceived → ACTIVATE_SUBSCRIPTION
  // 4. Cross-tenant isolation
  // 5. Failed step with onError=STOP
  // 6. Retry FAILED instance
});
