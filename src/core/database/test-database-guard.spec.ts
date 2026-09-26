import { assertTestDatabaseTarget } from './test-database-guard';

describe('assertTestDatabaseTarget', () => {
  it('allows a local database with a test-only name', () => {
    expect(() =>
      assertTestDatabaseTarget({
        nodeEnv: 'test',
        host: '127.0.0.1',
        database: 'backend_training_test',
      }),
    ).not.toThrow();
  });

  it.each([
    ['remote host', 'db.example.com', 'backend_training_test'],
    ['non-test database', 'localhost', 'backend_training'],
  ])('rejects a test connection with a %s', (_reason, host, database) => {
    expect(() =>
      assertTestDatabaseTarget({
        nodeEnv: 'test',
        host,
        database,
      }),
    ).toThrow(/Refusing to connect/);
  });

  it('does not change non-test connection targets', () => {
    expect(() =>
      assertTestDatabaseTarget({
        nodeEnv: 'production',
        host: 'db.example.com',
        database: 'backend_training',
      }),
    ).not.toThrow();
  });
});
