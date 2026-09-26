import request from 'supertest';
import { createE2eTestContext } from './e2e/e2e-test-context';

describe('Health HTTP e2e', () => {
  const context = createE2eTestContext();

  it('returns the configured health response', async () => {
    await request(context.app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', details: {} });
  });
});
