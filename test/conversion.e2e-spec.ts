import request from 'supertest';
import { createE2eTestContext } from './e2e/e2e-test-context';
import { FILE_CONVERSION_STATUS } from '../src/modules/conversion/application/constants/file-conversion-status';
import { FILE_TYPE } from '../src/modules/conversion/application/constants/file-type';
import { TransformationHistoryItemEntity } from '../src/modules/conversion/infrastructure/entity/transformation-history-item.entity';

describe('Conversion HTTP e2e', () => {
  const context = createE2eTestContext();

  it('lists supported text and image formats for authenticated users', async () => {
    const textFormats = await context
      .asAdmin('get', '/api/convert/formats')
      .expect(200);
    expect(textFormats.body).toEqual(
      expect.arrayContaining([
        { source: 'csv', target: ['json', 'xml', 'yaml'] },
        { source: 'json', target: ['csv', 'xml', 'yaml'] },
      ]),
    );

    const imageFormats = await context
      .asAdmin('get', '/api/images/convert/formats')
      .expect(200);
    expect(imageFormats.body).toEqual(
      expect.arrayContaining([
        { source: 'png', target: ['jpeg'] },
        { source: 'svg', target: ['jpeg', 'png'] },
      ]),
    );

    await request(context.app.getHttpServer())
      .get('/api/convert/formats')
      .expect(401);
  });

  it('converts an uploaded CSV to JSON and persists conversion history', async () => {
    const response = await context
      .asAdmin('post', '/api/convert')
      .field('targetFormat', 'json')
      .attach('file', Buffer.from('name,age\nAda,37\n'), {
        filename: 'people.csv',
        contentType: 'text/csv',
      })
      .expect(201);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.text).toContain('"name": "Ada"');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="converted.json"',
    );

    const history = await context
      .asAdmin('get', '/api/transformations/history?limit=10')
      .expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({
      type: FILE_TYPE.TEXT,
      sourceFormat: 'csv',
      targetFormat: 'json',
      status: FILE_CONVERSION_STATUS.SUCCESS,
      userId: context.testUsers.admin.userId,
    });
    expect(history.body.nextCursor).toBeNull();
    expect(
      await context.dataSource
        .getRepository(TransformationHistoryItemEntity)
        .count(),
    ).toBe(1);
  });

  it('rejects unsupported conversion formats and records the failed attempt', async () => {
    await context
      .asAdmin('post', '/api/convert')
      .field('targetFormat', 'exe')
      .attach('file', Buffer.from('name\nAda\n'), {
        filename: 'people.csv',
        contentType: 'text/csv',
      })
      .expect(415);

    const history = await context
      .asAdmin('get', '/api/transformations/history')
      .expect(200);
    expect(history.body.items[0]).toMatchObject({
      sourceFormat: 'csv',
      targetFormat: 'exe',
      status: FILE_CONVERSION_STATUS.ERROR,
      errorCode: 415,
    });
  });

  it('rejects malformed history cursors', async () => {
    await context
      .asAdmin('get', '/api/transformations/history?cursor=not-a-cursor')
      .expect(400);
  });
});
