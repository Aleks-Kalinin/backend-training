---
name: security-audit
description: Use when reviewing backend changes for auth, validation, session, cookie, CORS, or request-safety issues.
---

# Security Audit

## Repository context

- The app uses Fastify middleware and security plugins.
- CORS is explicitly configured in `src/main.ts`.
- Cookies are registered with `@fastify/cookie` and a secret from config.
- Global validation is enabled with `ValidationPipe({ whitelist: true })`.

## Review priorities

- Validate all user input before using it in business logic or database queries.
- Check auth/session flows and JWT secret handling.
- Review cookie and CORS settings for safe defaults.
- Confirm routes do not expose sensitive operations without authorization checks.

## Repo-specific concerns

- This project is backend-only and uses request validation heavily; do not assume frontend sanitization is enough.
- Keep secrets in env config and never hardcode them in code or docs.
- Respect the project’s Fastify security setup and avoid bypassing its intended configuration.

## Good default checks

- DTO validation for request bodies/params.
- Authorization checks before privileged operations.
- Safe handling of file uploads, content, and external inputs.
- No debug or stack traces leaked to clients.

## Do not

- Do not ignore validation or authorization assumptions.
- Do not weaken CORS or cookie protections without clear reason.
- Do not add unsafe debug logging or raw error output.

## Final review checklist

- User input is validated.
- Sensitive routes are protected.
- Secrets are not exposed.
- Security-related settings remain aligned with repo conventions.
