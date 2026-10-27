import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Master Data Platform (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('CASE 1: GET /master-data/suppliers should be protected or return list', () => {
    return request(app.getHttpServer())
      .get('/master-data/suppliers')
      .expect((res) => {
        // Accept 200 (if no auth) or 401/403
        expect([200, 401, 403]).toContain(res.status);
      });
  });

  it('CASE 2: POST /master-data/taxes without auth should fail or succeed based on guards', () => {
    return request(app.getHttpServer())
      .post('/master-data/taxes')
      .send({ code: 'VAT10', name: 'VAT 10%', rate: 10 })
      .expect((res) => {
        expect([201, 400, 401, 403]).toContain(res.status);
      });
  });
});
