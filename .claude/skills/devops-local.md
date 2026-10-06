---
name: devops-local
description: Use when configuring local environment setup, running the app, container setup, or environment-specific backend operations.
---

# DevOps Local

## Repository context

- Local runtime config uses `.env` and values from `.env.example`.
- Postgres is available through Docker Compose (`docker-compose.yml`).
- E2E tests use a separate `.env.test` database setup.

## Local setup expectations

- Keep runtime config in `.env` and do not commit secrets.
- Use Docker Compose for PostgreSQL when working locally.
- Respect the expected environment keys for server, JWT, cookie, and database settings.

## Common commands

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run test:e2e
```

## Project-specific guidance

- The app defaults to `PORT=3007`.
- Database settings are required for application startup and e2e validation.
- Keep production and test configuration isolated; never reuse production secrets in test datasets.

## Do not

- Do not assume the app works without a configured Postgres instance.
- Do not place production credentials in `.env.test`.
- Do not hardcode local-only configuration into shared code.

## Validation checklist

- `.env` values match runtime expectations.
- Database is available and healthy.
- Local app can start with `npm run start:dev`.
- Test DB setup is isolated from production config.
