---
name: api-contract
description: Use when creating or updating HTTP routes, DTOs, Swagger docs, or API versioning in this backend.
---

# API Contract

## Repository context

- Base API routes are versioned under `/api/v1`.
- Swagger is enabled and served from `/docs` and `/docs-json`.
- Controllers should not duplicate `/api` in path declarations.

## Required behaviors

- Keep route paths consistent with the existing versioned API structure.
- If introducing a breaking change, add a new API version instead of silently changing the old contract.
- Prefer request validation via DTOs and `ValidationPipe`.
- Preserve compatibility for older routes during migration windows.

## When editing routes

- Inspect related controllers and route patterns before adding new endpoints.
- Keep method semantics clean: GET, POST, PUT/PATCH, DELETE with consistent conventions.
- Use descriptive controller and method names.
- Ensure response codes and error handling align with NestJS patterns already used in the project.

## Swagger and docs

- Update or preserve OpenAPI metadata when adding endpoints or changing request/response shapes.
- Keep public APIs explainable in the generated Swagger docs.
- Do not add routes that are undocumented without clear reason.

## Do not

- Do not add unversioned routes casually.
- Do not repeat `/api` inside controller route strings.
- Do not create inconsistent naming or broken response contracts.

## Validation checklist

- Route path is versioned correctly.
- DTO validation is in place where needed.
- Swagger documentation remains accurate.
- Existing consumers are not unintentionally broken.
