---
name: database-orm
description: Use for TypeORM entities, repositories, migrations, transactions, or PostgreSQL data access work in this repository.
---

# Database ORM

## Repository context

- Database layer is PostgreSQL + TypeORM.
- Connection and config are organized under `src/core/database` and `src/database`.
- Transactions use `typeorm-transactional`.
- `POSTGRES_SYNCHRONIZE` is false by default; migrations are the intended production path.

## Core rules

- Prefer TypeORM entities and repositories over raw SQL unless a migration or direct DB feature requires it.
- Use `TypeOrmModule.forFeature([YourEntity])` in feature modules.
- Inject repositories with `@InjectRepository(...)`.
- Keep schema evolution in migrations under `src/database/migrations`.
- Do not rely on `POSTGRES_SYNCHRONIZE` for production changes.

## Project-specific expectations

- App-level DB config lives in the repository’s config service and environment setup.
- E2E tests use a separate PostgreSQL configuration (`.env.test`) and not the production env.
- Database operations should respect the repo’s transaction model if the task requires atomicity.

## When adding or changing entities

- Check nearby entities and repository patterns before creating a new one.
- Keep field names and relationships consistent with the current schema design.
- Consider migration impact, not just runtime entity code.

## Do not

- Do not use SQLite or other DB assumptions in this project.
- Do not bypass repository pattern for ordinary CRUD work.
- Do not add migrations without considering whether the application expects schema drift or a generated migration.

## Validation checklist

- Entity/repository pattern matches existing project conventions.
- Migration or schema changes are accounted for.
- Data access is safe and consistent with transaction expectations.
