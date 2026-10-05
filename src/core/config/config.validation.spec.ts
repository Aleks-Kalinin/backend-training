import { validateConfig } from './config.validation';

const requiredConfig = {
  PORT: '3000',
  NODE_ENV: 'test',
  COOKIE_SECRET: 'cookie-secret',
  JWT_SECRET: 'jwt-secret',
  JWT_REFRESH_SECRET: 'jwt-refresh-secret',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_USER: 'user',
  POSTGRES_PASSWORD: 'password',
  POSTGRES_DB: 'database',
};

describe('validateConfig', () => {
  it('transforms environment values and supplies optional defaults', () => {
    const config = validateConfig({
      ...requiredConfig,
      HEALTH_CHECK_ENABLED: 'true',
      THROTTLE_GLOBAL_TTL: '5000',
      POSTGRES_SYNCHRONIZE: 'false',
    });

    expect(config.PORT).toBe(3000);
    expect(config.POSTGRES_PORT).toBe(5432);
    expect(config.HEALTH_CHECK_ENABLED).toBe(true);
    expect(config.THROTTLE_GLOBAL_TTL).toBe(5000);
    expect(config.POSTGRES_SYNCHRONIZE).toBe(false);
    expect(config.THROTTLE_GLOBAL_LIMIT).toBe(10);
    expect(config.POSTGRES_LOGGING).toBe(false);
  });

  it('does not require Supabase settings in tests and defaults the bucket', () => {
    const config = validateConfig(requiredConfig);

    expect(config.SUPABASE_URL).toBeUndefined();
    expect(config.SUPABASE_AVATARS_BUCKET).toBe('avatars');
  });

  it('requires Supabase settings outside of tests', () => {
    expect(() =>
      validateConfig({ ...requiredConfig, NODE_ENV: 'production' }),
    ).toThrow(/SUPABASE_URL[\s\S]*SUPABASE_SERVICE_ROLE_KEY/);

    expect(
      validateConfig({
        ...requiredConfig,
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }).SUPABASE_URL,
    ).toBe('https://project.supabase.co');
  });

  it('rejects an invalid Supabase URL or bucket name', () => {
    expect(() =>
      validateConfig({
        ...requiredConfig,
        NODE_ENV: 'development',
        SUPABASE_URL: 'ftp://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    ).toThrow('Configuration validation failed');

    expect(() =>
      validateConfig({
        ...requiredConfig,
        SUPABASE_AVATARS_BUCKET: 'Bad/Name',
      }),
    ).toThrow('Configuration validation failed');
  });

  it('rejects invalid required and numeric values', () => {
    expect(() =>
      validateConfig({
        ...requiredConfig,
        PORT: 'not-a-port',
        POSTGRES_HOST: 'invalid host name',
      }),
    ).toThrow('Configuration validation failed');
  });
});
