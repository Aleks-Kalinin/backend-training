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

## API and Swagger

All HTTP API routes use URI versioning under `/api/v1` (for example,
`http://localhost:3007/api/v1/auth/login` and
`http://localhost:3007/api/v1/health`). Swagger UI is available at
`http://localhost:3007/docs`; its OpenAPI JSON document is at
`http://localhost:3007/docs-json`.

When adding endpoints, do not repeat the `/api` prefix in controller paths.
The current default API version is `1`; introduce a new version when making
breaking API changes and keep older versions available during migration.

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

The HTTP e2e tests are split by feature in `test/`: `auth.e2e-spec.ts`, `users.e2e-spec.ts`, `avatar.e2e-spec.ts`, `rbac.e2e-spec.ts`, `settings.e2e-spec.ts`, `conversion.e2e-spec.ts`, and `health.e2e-spec.ts`. Shared app setup, fixtures, and authentication helpers live in `test/e2e/e2e-test-context.ts`. Avatar storage is replaced with an in-memory fake (`FakeAvatarStorage`), so e2e runs never need Supabase credentials, and per-route throttle counters are reset before each test.

The migrations in `src/database/migrations` are incremental and do not create the base schema, so the test database uses `POSTGRES_SYNCHRONIZE=true` to create its schema from the entities. The e2e suite truncates its tables before testing and clears them again afterward, while preserving the schema. Do not use this test configuration with a database containing data you need.

## Avatar storage (Supabase)

`PUT /api/v1/users/:id/photo` (multipart, `file` field) and `DELETE /api/v1/users/:id/photo` manage uploaded profile avatars. Uploads are re-encoded to WebP (max 1024×1024, metadata stripped) and stored in Supabase Storage under `{userId}/{uuid}.webp`. The profile `photo` field returns the object's public URL when an upload exists, otherwise the URL-based photo set via `PATCH /api/v1/users/:id`.

**Configuration** (server-side only; the app fails to start without them unless `NODE_ENV=test`):

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Project URL, e.g. `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key used for writes/deletes. Never expose it to clients or commit it. |
| `SUPABASE_AVATARS_BUCKET` | Bucket name (default `avatars`) |

**Bucket setup** (manual, in the Supabase dashboard; the app does not provision it):

1. Create a bucket named `avatars` (or your `SUPABASE_AVATARS_BUCKET`) and mark it **Public** so profile photos can be read without authentication.
2. Set *Allowed MIME types* to `image/webp` (the backend only stores re-encoded WebP) and *File size limit* to `5 MB`.
3. Do not add storage policies that allow `anon` or `authenticated` roles to insert, update, or delete objects. Only the backend's service-role key writes to the bucket.
4. Record which project/bucket each environment uses in its deployment configuration. Free-plan quotas and project pausing are provider constraints. Monitor storage errors (`AVATAR_STORAGE_UPLOAD` log events) and quota usage.

**Cleanup:** replaced or removed objects are deleted after the database update commits. If a deletion fails, a row is written to `avatar_cleanup_tasks` and retried every 10 minutes, up to 10 attempts. Rows that stay behind with `attempts >= 10` need manual follow-up, and `AVATAR_CLEANUP_RETRY` events with `status: "exhausted"` are logged at error level.

## Libraries

| Purpose       | Library                  |
|---------------|--------------------------|
| HTTP          | Fastify (`@nestjs/platform-fastify`) |
| Validation    | class-validator          |
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
