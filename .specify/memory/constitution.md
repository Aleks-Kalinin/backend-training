<!--
Sync Impact Report
- Version change: unversioned scaffold -> 1.0.0
- Modified principles: scaffold placeholders -> Module Boundaries; HTTP and API Contracts; Security and Authentication;
  Testing and Data Integrity; Observability and Operational Safety
- Added sections: Stack Constraints; Development Workflow
- Removed sections: none
- Deferred items: none
-->

# NestJS Backend Constitution

## Core Principles

### I. Module Boundaries

All application capabilities MUST be organized as NestJS modules with clear ownership
and explicit imports. Controllers MUST be thin entry points, services MUST hold business
logic, and shared logic MUST live in reusable providers or dedicated core modules.
Feature work MUST map to a spec under `specs` folder before implementation begins.
Rationale: predictable module boundaries keep the codebase testable and prevent
cross-module coupling from turning into hidden architecture.

### II. HTTP and API Contracts

The HTTP layer MUST use Fastify patterns and types, not Express-specific APIs. Route
behavior, request shapes, response codes, and headers MUST match the feature spec
contract exactly, including cookie behavior, content types, and error statuses.
Any endpoint that returns files, streams, or cookies MUST define deterministic
headers and status codes in the spec and implementation.
Rationale: the project exposes authenticated APIs and file-processing endpoints, so
contract drift is a product defect, not an implementation detail.

### III. Security and Authentication

Authentication, authorization, and session handling MUST be enforced server-side for
every protected request. JWT cookies, refresh behavior, rate limits, account checks,
and token validation MUST follow the current feature specification and MUST never be
weakened for convenience.
Sensitive material such as raw JWTs, secrets, passwords, file contents, or PII MUST
not be logged. Security-sensitive parsers, transformers, and upload handlers MUST be
treated as hostile-input boundaries.
Rationale: the feature set includes login, session authorization, and file transforms,
so security failures have direct user impact and exploitability.

### IV. Testing and Data Integrity

New behavior MUST be accompanied by automated tests that prove the contract at the
appropriate level: unit tests for logic, integration tests for persistence and module
interaction, and e2e tests for public HTTP flows. Database changes MUST be represented
through migrations, not implicit schema drift, and transactional behavior MUST be used
when consistency matters.
Rationale: the project depends on PostgreSQL, TypeORM, and feature-driven contracts, so
test coverage and migration discipline are the only reliable guardrails against regressions.

### V. Observability and Operational Safety

Every non-trivial flow MUST have actionable logging, bounded execution time, and failure
modes that protect the event loop and infrastructure. File conversions, image processing,
and other CPU-heavy work MUST not block request handling longer than necessary and MUST
honor size limits, timeouts, and safe parser settings.
Rationale: conversion and upload endpoints are expensive and attack-prone, so operational
safety is required to keep the service stable under valid and invalid traffic.

## Stack Constraints

- The runtime HTTP kernel is Fastify via `@nestjs/platform-fastify`; Express-specific
  APIs MUST NOT be introduced.
- Configuration MUST come through NestJS configuration patterns and validated env input.
- PostgreSQL and TypeORM are the persistence standard; entities, repositories, and
  migrations MUST follow the existing database module conventions.
- `@Transactional()` MUST be used where multi-step persistence needs atomicity.
- All code MUST use the existing `@` path alias conventions.

## Development Workflow

- Feature implementation MUST start from a spec in `.specs/features` and the spec is the
  source of truth for behavior until the feature is updated.
- Schema and contract changes MUST be reflected in tests before merge.
- Migrations MUST be generated or written explicitly and reviewed for reversibility.
- Pre-merge verification MUST include formatting, linting, unit tests, and any relevant
  e2e coverage for the changed surface area.
- Changes that alter auth, cookies, uploads, or file transformation behavior MUST include
  explicit test cases for success, validation failure, and security rejection paths.

## Governance

This constitution overrides informal practice and lower-level guidance whenever they
conflict. Amendments MUST be documented as a constitution update, with the affected
principles or sections named explicitly and the version bumped according to semantic
versioning.

Versioning policy:

- MAJOR for principle removals, principle redefinitions, or incompatible governance
  changes.
- MINOR for new principles, new sections, or materially expanded governance.
- PATCH for clarifications, wording fixes, and non-semantic refinements.

Compliance review expectations:

- Every feature spec, implementation plan, and code review MUST be checked against this
  constitution.
- Any deviation from the constitution MUST be called out explicitly and justified in the
  same change set.
- If a feature spec conflicts with the constitution, the constitution wins until an
  amendment is approved and written.

**Version**: 1.0.0 | **Ratified**: 2026-09-01 | **Last Amended**: 2026-09-01
