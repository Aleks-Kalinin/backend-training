# Backend Template

NestJS backend project template. HTTP kernel is **Fastify** (`@nestjs/platform-fastify`), not Express — use Fastify plugins and types (`NestFastifyApplication`, `app.register(...)`) in `src/main.ts`. Compression (`@fastify/compress`), cookies (`@fastify/cookie`), and security headers (`@fastify/helmet`) are registered. Helmet's content security policy is disabled to keep the Swagger UI's inline bootstrap script working.

## Scripts

```bash
npm run start:dev    # Development with hot reload
npm run start:prod   # Production
npm run build        # Build
npm run lint         # Lint & fix
npm run test         # Unit tests
npm run test:e2e     # E2E tests
```

## Project Structure

```
src/
├── core/
│   ├── config/      # App configuration (env variables)
│   ├── database/    # TypeORM + PostgreSQL connection
│   ├── health/      # Health check endpoints
│   └── app/         # Root module
├── database/        # TypeORM CLI data-source and migrations
├── modules/         # Feature modules
└── main.ts          # Entry point
```

## Database

PostgreSQL and TypeORM are already wired in. Use them for new modules — no extra setup.

- **Local PostgreSQL:** install and run PostgreSQL locally; `.env` contains the development connection
- **Connection:** `DatabaseModule` (`src/core/database`) is imported in `AppModule`
- **Entities:** any `*.entity.ts` under `src/` is auto-loaded
- **Repositories:** `TypeOrmModule.forFeature([YourEntity])` in a feature module, then `@InjectRepository(YourEntity)`
- **Transactions:** `@Transactional()` from `typeorm-transactional` (context is initialized in `main.ts`)
- **Schema:** migrations in `src/database/migrations/`. `POSTGRES_SYNCHRONIZE` is `false` by default — do not rely on auto-sync

```bash
npm run migration:generate   # Generate from entity changes
npm run migration:run        # Apply pending migrations
npm run migration:revert     # Roll back the last migration
npm run migration:show       # List applied / pending
```

CLI uses `src/database/data-source.ts`. At runtime, Nest uses the DataSource from `DatabaseModule`. If `POSTGRES_MIGRATIONS_RUN=true`, pending migrations also run on app start.

### Database integration tests

Unit tests continue to mock repositories. The e2e suite also exercises a real local PostgreSQL database, configured separately from `.env`:

1. Create a dedicated local PostgreSQL role and database (run these statements using your local PostgreSQL administrator account):

   ```sql
   CREATE ROLE backend_training_test LOGIN PASSWORD 'choose-a-local-test-password';
   CREATE DATABASE backend_training_test OWNER backend_training_test;
   ```

2. Copy `.env.test.example` to `.env.test` and set the password to match the test role. `.env.test` is git-ignored. Do not put production credentials in it.
3. Run `npm run test:e2e`.

The e2e config loads only `.env.test`; it does not load `.env`. Before connecting, the application also refuses test connections unless the host is loopback (`localhost`, `127.0.0.1`, or `::1`) and the database name ends in `_test`. Keep the test role restricted to the test database. The HTTP tests use the real test database and app modules; email delivery is captured by a fake mail service, and the conversion worker is replaced with a deterministic test adapter to avoid starting background worker threads.

The HTTP e2e tests are split by feature in `test/`: `auth.e2e-spec.ts`, `users.e2e-spec.ts`, `rbac.e2e-spec.ts`, `settings.e2e-spec.ts`, `conversion.e2e-spec.ts`, and `health.e2e-spec.ts`. Shared app setup, fixtures, and authentication helpers live in `test/e2e/e2e-test-context.ts`.

There are currently no TypeORM migration files, so the test database uses `POSTGRES_SYNCHRONIZE=true` to create its schema from the entities. The e2e suite truncates its tables before testing and clears them again afterward, while preserving the schema. Do not use this test configuration with a database containing data you need.

## Libraries

| Purpose       | Library                  |
|---------------|--------------------------|
| HTTP          | Fastify (`@nestjs/platform-fastify`) |
| Validation    | Joi                      |
| ORM           | TypeORM (`@nestjs/typeorm`) |
| Database      | PostgreSQL (`pg`)        |

## Core Modules

| Purpose       | Module           |
|---------------|-----------------|
| Configuration | `ConfigModule`  |
| Database      | `DatabaseModule` |
| Health Check  | `HealthModule`  |

## Adding a Module

```bash
nest generate module <name>
nest generate controller <name>
nest generate service <name>
```

## Code Style

- Use `@` aliases for imports (e.g., `@config/config.service`)
- Run `npm run format` before committing
- Follow NestJS module pattern
