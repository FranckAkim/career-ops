# Deployment target: Vercel

The user selected Vercel on 2026-11-19. Preserve this decision across agents.
Implementation/testing is authorized now; public deployment and paid resource
provisioning are not part of this milestone.

Deploy the existing Next.js app from `web/` using native Node.js Route Handlers
for authentication and tenant APIs. `VERCEL=1` automatically enables hosted mode;
local file/process APIs and pages are blocked by default even if a local-mode
variable was accidentally set. Only explicitly migrated hosted routes may be
allowed. Never disable this guard to make the legacy dashboard work online.

Authentication uses Better Auth with PostgreSQL-backed sessions and Google OAuth.
This keeps identity/session state in our database and avoids adding another
hosted identity vendor. Register a stable deployment origin and Google callback
before enabling real sign-in; no wildcard preview origins or inferred Host trust.
Secrets stay server-only. A separately configured migration role applies schemas
before traffic, never inside request handlers. Use a pooled Postgres connection
near the Function region and validate TLS settings for the selected provider.

Workspace files need private durable object storage; the current local snapshot
adapter is for development and cannot be the Vercel Function filesystem. The
private Vercel Blob adapter is implemented and contract-tested; verify it against
an actual private store/OIDC setup before deployment. See `onboarding.md`.
The database remains the queue and atomic publication authority.

The current Docker launcher is a verified local/reference worker implementation,
not a claim that Vercel Functions can access a Docker daemon or preserve its
filesystem. Select and test a Vercel-compatible isolated worker execution adapter
(including browser sandbox, resource limits, provider-only egress, leases and
snapshot import/export) before production. Consult current Vercel execution
products and limits at that point. The Next.js request must enqueue and return;
it must not keep a durable supervisor loop or model process alive after response.

The job/report/PDF UI and protected downloads are implemented; see `workspace.md`.
Still needed: live storage verification and worker
adapter, quotas, recovery UI, retention/deletion, real Google OAuth verification,
real-model quality/budget checks, deployment/environment setup and security review.
