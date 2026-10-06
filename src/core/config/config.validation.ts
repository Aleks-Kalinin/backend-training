import { Transform, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';

import { Config } from './config.types';

const transformNumber = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return value;
  }

  return Number(value);
};

const transformBoolean = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  switch (value.trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
    case 'on':
      return true;
    case 'false':
    case '0':
    case 'no':
    case 'off':
      return false;
    default:
      return value;
  }
};

class EnvironmentVariables implements Config {
  @Transform(transformNumber)
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number;

  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test';

  @IsString()
  @IsNotEmpty()
  COOKIE_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @Transform(transformBoolean)
  @IsBoolean()
  @IsOptional()
  HEALTH_CHECK_ENABLED = false;

  @Transform(transformNumber)
  @IsNumber()
  @IsOptional()
  THROTTLE_GLOBAL_TTL = 10000;

  @Transform(transformNumber)
  @IsNumber()
  @IsOptional()
  THROTTLE_GLOBAL_LIMIT = 10;

  @IsString()
  @Matches(
    /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  )
  POSTGRES_HOST: string;

  @Transform(transformNumber)
  @IsInt()
  @Min(0)
  @Max(65535)
  POSTGRES_PORT: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB: string;

  @Transform(transformBoolean)
  @IsBoolean()
  @IsOptional()
  POSTGRES_SYNCHRONIZE = false;

  @Transform(transformBoolean)
  @IsBoolean()
  @IsOptional()
  POSTGRES_LOGGING = false;

  @Transform(transformBoolean)
  @IsBoolean()
  @IsOptional()
  POSTGRES_MIGRATIONS_RUN = false;

  @ValidateIf(isSupabaseConfigRequired)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  SUPABASE_URL?: string;

  @ValidateIf(isSupabaseConfigRequired)
  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY?: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,62}$/)
  @IsOptional()
  SUPABASE_AVATARS_BUCKET = 'avatars';
}

/**
 * Supabase settings are mandatory except in tests, where the storage adapter
 * is replaced by a fake. Partially provided test settings are still validated.
 */
function isSupabaseConfigRequired(config: EnvironmentVariables): boolean {
  return (
    config.NODE_ENV !== 'test' ||
    config.SUPABASE_URL !== undefined ||
    config.SUPABASE_SERVICE_ROLE_KEY !== undefined
  );
}

export function validateConfig(
  config: Record<string, unknown>,
): Config & Record<string, unknown> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new Error(`Configuration validation failed: ${messages.join('; ')}`);
  }

  return { ...config, ...validatedConfig };
}
