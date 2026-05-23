# API Exposure Audit

## Current public API groups

- `/api/v1/auth`
- `/api/v1/docs`
- `/api/v1/build`
- `/api/v1/project`
- `/api/v1/system`
- `/api/v1/bibliography`
- `/api/v1/sync` (deprecated)
- `/api/settings`
- `/api/covers`
- `/api/fullpage`

## Authentication boundary

- `auth/session`, `auth/admin/login`, `auth/invite-login`, and `auth/logout` remain public authentication entrypoints.
- Editing, build, settings, bibliography, cover, and fullpage operations require either editor or admin access.
- Settings and privileged build operations remain admin-only where already defined.
- Deprecated `/api/v1/sync/*` requires authentication and returns `410 Gone`.

## Static and generated file exposure

- `/outputs/*` is authenticated.
- `/assets/*` is authenticated.
- Distributed deployments do not expose generated outputs or project assets anonymously.

## API documentation exposure

- `/docs`, `/redoc`, and `/openapi.json` are disabled by default.
- Set `EXPOSE_API_DOCS=true` only for development environments that explicitly need API documentation.

## Legacy and mixed-prefix surface

- `/api/settings`, `/api/covers`, and `/api/fullpage` remain in place for UI compatibility.
- These routes are retained in the current release candidate but are part of the legacy or mixed-prefix surface.
- Prefix normalization is deferred to a later phase.

## Follow-up work

- Normalize all routes under a single versioned prefix.
- Revisit whether authenticated static delivery should be split between project assets and UI runtime assets.
- Remove deprecated `/api/v1/sync/*` endpoints after the compatibility window closes.
