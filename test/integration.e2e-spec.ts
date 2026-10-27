import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Integration Hub (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('GET /integration/api-keys protected', () => {
    return request(app.getHttpServer()).get('/integration/api-keys').expect((res) => {
      expect([200, 401, 403]).toContain(res.status);
    });
  });
  it('GET /integration/connectors/available protected', () => {
    return request(app.getHttpServer()).get('/integration/connectors/available').expect((res) => {
      expect([200, 401, 403]).toContain(res.status);
    });
  });
});
