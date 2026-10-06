# CLAUDE.md

This repository is a NestJS backend application using Fastify, PostgreSQL, and TypeORM.

## Project overview

- Runtime: Node.js + TypeScript + NestJS
- HTTP server: Fastify (`@nestjs/platform-fastify`)
- Database: PostgreSQL + TypeORM
- Validation: `class-validator`
- API versioning: `/api/v1`
- Swagger: `/docs` and `/docs-json`
- Local database: Docker Compose file at `docker-compose.yml`

## Most important files

- `src/main.ts` — bootstrap, Fastify setup, plugins, global validation, CORS
- `src/core/app/app.module.ts` — root app composition
- `src/core/config/config.service.ts` — env access pattern
- `src/core/database` — database module and connection setup
- `src/database/data-source.ts` — TypeORM CLI configuration
- `README.md` — repo-level setup and workflow guidance
- `.env.example` — environment variables for local runtime

## Commands

```bash
npm install
npm run start:dev
npm run build
npm run lint
npm run test
npm run test:e2e
npm run migration:generate
npm run migration:run
npm run migration:revert
npm run migration:show
```

## Architecture conventions

- Use NestJS modules, services, controllers, and providers.
- Keep feature code under `src/modules/<feature>`.
- Shared infrastructure goes under `src/core`.
- Do not use Express-specific patterns; this app is Fastify-based.
- Prefer `@` aliases for imports.
- Keep API routes under `/api/v1` and do not repeat `/api` in controller paths.
- Swagger should remain updated for public endpoint changes.
- Prefer TypeORM entities/repositories for database access.
- Use migrations for schema change management; do not rely on `POSTGRES_SYNCHRONIZE` in production.

## Environment and config

- Local runtime config uses `.env` (example in `.env.example`).
- Keys include:
  - `PORT` (default `3007`)
  - `COOKIE_SECRET`
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
  - `POSTGRES_*`
- E2E tests require a separate local Postgres database and `.env.test` configuration.
- Do not put production secrets in `.env.test`.

## Local development expectations

- Start the app with `npm run start:dev`.
- Run the database via Docker Compose if needed.
- Keep test configuration isolated from production configuration.
- Run the smallest relevant validation after code changes.

## Working preferences for AI agents

1. Check the nearest relevant module before editing.
2. Prefer existing patterns over introducing new abstractions.
3. Preserve API compatibility unless the task explicitly requires a breaking change.
4. Keep changes surgical and consistent with the repo’s NestJS structure.
5. Validate with the smallest relevant command after the change.

## Available repo skills

The repository includes repo-specific skill files under `.claude/skills/`.

Use them when relevant:

- `backend-author.md`
- `api-contract.md`
- `database-orm.md`
- `test-engineer.md`
- `security-audit.md`
- `devops-local.md`

## Do not

- Do not assume Express instead of Fastify.
- Do not create unversioned API routes.
- Do not hardcode secrets or environment data.
- Do not ignore validation and auth checks.
- Do not rely on auto-sync for production schema changes.
