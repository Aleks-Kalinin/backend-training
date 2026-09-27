import { existsSync } from 'node:fs';

process.env.NODE_ENV = 'test';

if (!existsSync('.env.test')) {
  throw new Error(
    'Missing .env.test. Copy .env.test.example and configure the dedicated local test database.',
  );
}
