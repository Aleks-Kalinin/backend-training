interface DatabaseTarget {
  nodeEnv: string;
  host: string;
  database: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertTestDatabaseTarget({
  nodeEnv,
  host,
  database,
}: DatabaseTarget): void {
  if (nodeEnv !== 'test') {
    return;
  }

  if (
    !LOOPBACK_HOSTS.has(host.toLowerCase()) ||
    !database.toLowerCase().endsWith('_test')
  ) {
    throw new Error(
      'Test database connections require a loopback host and a database name ending in "_test". Refusing to connect.',
    );
  }
}
