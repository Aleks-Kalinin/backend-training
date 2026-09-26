# Config Module

A type-safe configuration module that wraps NestJS `@nestjs/config` with `class-validator` validation. Environment variables are transformed and validated at application startup, ensuring the app fails fast if required config is missing or invalid.

## Usage

Inject `ConfigService` into any provider:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from './config/config.service';

@Injectable()
export class MyService {
  constructor(private readonly config: ConfigService) {}

  someMethod() {
    const port = this.config.get('PORT');      // Type-safe, autocomplete works
    const env = this.config.get('NODE_ENV');   // Returns 'development' | 'production'
  }
}
```

## Adding New Options

1. **Define the type** in `config.types.ts`:

```typescript
export interface Config {
  PORT: number;
  NODE_ENV: 'development' | 'production';
  DATABASE_URL: string;  // Add new option here
}
```

2. **Add validation** to `EnvironmentVariables` in `config.validation.ts` using `class-validator` decorators. Numeric and boolean environment values are transformed before validation:

```typescript
@Transform(({ value }) => Number(value))
@IsInt()
@Min(0)
@Max(65535)
PORT: number;
```

3. **Set the environment variable** in your `.env` file or environment.

That's it. The new option is now type-safe and validated at startup.
