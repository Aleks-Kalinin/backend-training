import request from 'supertest';
import { API_BASE_PATH } from '../../src/core/api-routing';
import { createE2eTestContext } from './e2e-test-context';

describe('Health HTTP e2e', () => {
  const context = createE2eTestContext();

  it('serves Swagger UI and an OpenAPI document for the versioned API', async () => {
    await request(context.app.getHttpServer()).get('/docs').expect(200);

    const document = await request(context.app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(document.body.paths).toHaveProperty(`${API_BASE_PATH}/health`);
  });

  it('returns the configured health response', async () => {
    await request(context.app.getHttpServer())
      .get(`${API_BASE_PATH}/health`)
      .expect(200)
      .expect({ status: 'ok', details: {} });
  });
});
