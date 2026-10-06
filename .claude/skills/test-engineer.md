---
name: test-engineer
description: Use when writing, updating, or validating Jest tests, e2e tests, or backend behavior in this repo.
---

# Test Engineer

## Repository context

- Unit tests are run via Jest.
- e2e tests use a real PostgreSQL test database configuration.
- Test config is separate from app config and intentionally uses `.env.test`.

## Required workflows

- Run the smallest relevant test command before finalizing changes.
- Prefer targeted specs or e2e files that cover the changed behavior.
- Keep tests focused on behavior, not implementation details.

## Before writing tests

- Check the relevant existing test patterns.
- Identify whether the change should be covered by unit tests, e2e tests, or both.
- Preserve the repo’s established Jest structure and naming conventions.

## Practical rules

- For backend logic changes, prefer tests around service or controller behavior.
- For DB-related behavior, consider e2e coverage when the change modifies real data flows.
- Keep test fixtures realistic and isolated.

## Do not

- Do not write broad tests for unrelated code.
- Do not rely on production environment values for test runs.
- Do not use `POSTGRES_SYNCHRONIZE` as a routine production pattern.

## Validation commands

```bash
npm run test
npm run test:e2e
npm run build
```

Use the smallest command that checks the changed behavior. If a module is local and isolated, targeted Jest tests are preferred.
