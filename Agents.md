# Agents.md

This repository is a NestJS backend application using Fastify, PostgreSQL, and TypeORM. It is designed to be a backend template with modular feature packages under `src/modules` and shared infrastructure under `src/core`.

## Project overview

- Runtime: Node.js + TypeScript + NestJS
- HTTP server: Fastify (`@nestjs/platform-fastify`)
- Database: PostgreSQL + TypeORM
- Validation: `class-validator`
- API shape: versioned routes under `/api/v1`
- Documentation: Swagger at `/docs` and `/docs-json`
- Container support: `docker-compose.yml` provisions PostgreSQL

## Key commands

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

## Local environment

Use `.env` for app runtime configuration. Example values are in `.env.example`.

Core env keys include:

- `PORT` (default `3007`)
- `COOKIE_SECRET`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `POSTGRES_SYNCHRONIZE`, `POSTGRES_MIGRATIONS_RUN`

For e2e tests, configure a separate database role and database. The README includes the workflow for `.env.test` and the test DB setup.

## Common architecture

```text
src/
├── main.ts                  # app bootstrap
├── core/
│   ├── app/                 # app module and app wiring
│   ├── api-routing.ts       # global API version routing
│   ├── config/             # config service and config types
│   ├── database/           # database module and connection setup
│   ├── health/             # health endpoint module
│   ├── swagger.ts          # Swagger configuration
│   └── ...
├── database/
│   ├── data-source.ts      # TypeORM CLI data source
│   └── migrations/         # DB migrations
├── modules/
│   ├── auth/
│   ├── conversion/
│   ├── mail/
│   ├── rbac/
│   ├── settings/
│   ├── users/
│   └── verification/
└── ...
```

## Important conventions

- Use NestJS modules, controllers, services, and providers rather than creating ad hoc patterns.
- Prefer `@` path aliases for imports.
- Do not use Express-specific code in API work. The app is bootstrapped with `FastifyAdapter` and should use Fastify-friendly patterns where relevant.
- Validation is globally enabled with `ValidationPipe({ whitelist: true })` in `src/main.ts`.
- API routes are versioned under `/api/v1`; do not repeat `/api` inside controller path declarations.
- Swagger is served from `/docs` and `/docs-json`; keep routes discoverable and documented.
- Database updates should usually go through TypeORM entities and repositories; use `TypeOrmModule.forFeature(...)` in feature modules.
- Transactions use `typeorm-transactional` and are initialized in `src/main.ts`.
- Migrations are under `src/database/migrations`; do not rely on `POSTGRES_SYNCHRONIZE` in production.
- Keep test configuration separate from production config; do not store production credentials in `.env.test`.

## Code style expectations

- Run `npm run format` before finishing code changes.
- Follow the existing NestJS module pattern.
- Keep feature modules isolated and organized under `src/modules/<feature>`.
- Prefer small, focused services/controllers over large monolithic handlers.
- Preserve the API versioning and shared config conventions.
- Add or update tests for behavior changes when practical.

## Notable files to inspect first

- `src/main.ts` — bootstrap, Fastify setup, global pipes, CORS, plugins
- `src/core/app/app.module.ts` — root module composition
- `src/core/config/config.service.ts` — env access pattern
- `src/core/database` — database setup and connection lifecycle
- `docker-compose.yml` — local Postgres container setup
- `README.md` — project-level guidance and operational notes

## Working preferences for agents

When making changes:

1. Check the nearest relevant module before editing.
2. Preserve API compatibility unless the task explicitly requires a breaking change.
3. Use the repo’s conventions for validation, Swagger, config, and database access.
4. Keep changes surgical and consistent with the existing NestJS structure.
5. Verify the smallest relevant command after changes (`npm run test`, `npm run build`, or targeted test commands when appropriate).

## Quick project-specific reminders

- This project is not a generic Express app; it runs on Fastify.
- Default API version is `1`; breaking API changes should add a new version, not silently break the old route.
- Swagger UI bootstrap is intentionally configured to allow inline scripts; do not “fix” this without understanding the existing security intent.
- The repo expects PostgreSQL running locally or through Docker; do not assume SQLite or another DB engine.
