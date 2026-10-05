---
name: backend-author
description: Use when implementing new NestJS backend features, modules, controllers, services, or refactoring existing backend code in this repository.
---

# Backend Author

## Repository context

- Stack: NestJS + TypeScript + Fastify
- Database: PostgreSQL + TypeORM
- Validation: `class-validator`
- API versioning: `/api/v1`
- App bootstrap: `src/main.ts`
- Core modules: `src/core/*`, feature modules: `src/modules/*`

## Core rules

- Prefer the existing NestJS module pattern: module -> controller -> service -> repository/entity as needed.
- Use `@` imports for repository-local paths.
- Keep business logic in services, not directly in controllers.
- Use feature folders under `src/modules/<feature>`.
- Follow the existing application architecture and keep changes scoped.

## Project-specific conventions

- This app is bootstrapped with `FastifyAdapter`, not Express.
- Use `ValidationPipe({ whitelist: true })` behavior when adding input validation.
- Route versioning is part of the API contract; do not repeat `/api` in controller paths.
- Swagger and docs are part of the app lifecycle; new endpoints should be discoverable and documented when appropriate.
- Configuration should be accessed via the repo’s `ConfigService` and `.env` conventions.

## Before making changes

- Read the relevant module and neighboring files first.
- Check whether a similar service/controller already exists.
- Preserve API compatibility unless the task explicitly requires breaking changes.

## After making changes

- Run `npm run format` if code was changed.
- Run the smallest relevant validation command, such as:
  - `npm run test`
  - `npm run build`
  - targeted Jest tests if a module has a focused suite

## Do not

- Do not introduce Express-specific code patterns.
- Do not bypass the config service or hardcode environment assumptions.
- Do not create one-off application structure inconsistent with the repo.
- Do not ignore versioning or validation conventions.
