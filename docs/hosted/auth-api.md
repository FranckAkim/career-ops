# Authenticated API milestone

Deployment target: Vercel. This milestone adds private hosted API wiring to the
existing Next.js app; it does not deploy a website. Reviewed profile onboarding
and its UI are now implemented; see [onboarding.md](onboarding.md).

## Identity and deployment boundary

Better Auth 1.7.26 runs server-side with the existing PostgreSQL driver. Its SDK
owns Google OAuth, signed HttpOnly/SameSite session cookies, session lookup and
revocation. Production password authentication is disabled; no test login route
or identity header exists. Google identity is account identity, never a source of
confirmed career facts. OAuth tokens use the SDK's encrypted database storage;
automatic account linking is disabled. SDK telemetry is
disabled. Session cookie caching is disabled so revocation is checked against the
database on each protected request. Sessions expire after seven days.

`VERCEL=1` or `CAREER_OPS_MODE=hosted` enables hosted isolation. Vercel cannot be
overridden to local mode. The proxy allows `/hosted`, `/api/auth/*` and `/api/hosted/*`;
all existing local pages and filesystem/process endpoints return 404. Future
hosted UI routes require an explicit allowlist entry and server-side session
checks. Static Next assets remain under the existing proxy exclusions. The
original loopback/origin guard remains in effect for local mode.

Proxy allowlisting is routing isolation, not authentication. The hosted handler
validates the SDK session independently and obtains the user ID from it. Clients
cannot submit identity, workspace roots, executable names, model keys or engine
revisions. Mutation requests require the configured exact Origin and JSON;
cross-site requests are rejected. Bodies are bounded to 256KB with a read deadline.
Responses use private/no-store caching and sanitize internal errors. Membership
checks happen inside the queue service; another tenant's job returns 404.

## Routes

| Method | Route | Behavior |
| --- | --- | --- |
| GET/POST | `/api/auth/*` | SDK authentication endpoints, including Google callback and sign-out |
| GET | `/api/hosted/session` | Current user ID/name; 401 without a valid session |
| GET | `/api/hosted/tenants` | Up to 100 current memberships and tenant generation/recovery state |
| GET | `/api/hosted/tenants/{tenant}/jobs` | Latest 100 job summaries; no posting payloads |
| POST | `/api/hosted/tenants/{tenant}/jobs` | Enqueue `evaluate` or `tailor`; requires `Idempotency-Key` |
| GET | `/api/hosted/tenants/{tenant}/jobs/{job}?after=0` | Status/result and up to 100 ordered durable events |
| POST | `/api/hosted/tenants/{tenant}/jobs/{job}/cancel` | Cancel with empty JSON `{}` |
| GET | `/api/hosted/tenants/{tenant}/artifacts/{job}/{kind}` | Protected committed `report` or binary `pdf` attachment |
| POST | `/api/hosted/tenants/{tenant}/recovery/discard` | Owner-only explicit discard with empty JSON `{}` |

Evaluation body: `{ "operation": "evaluate", "postingText": "...", "postingUrl": "..." }`.
Tailoring body: `{ "operation": "tailor", "evaluationJobId": "..." }`.
The queued job uses server-owned `HOSTED_ENGINE_REVISION`. The HTTP request never
starts a worker or migrates the database. Initial personal-workspace provisioning
is now available through the reviewed onboarding service, not arbitrary roots.

## Server configuration (not provisioned)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Private PostgreSQL runtime-role connection, using provider-approved TLS/pooling |
| `BETTER_AUTH_URL` | Exact stable origin, HTTPS in production; loopback HTTP allowed for development |
| `BETTER_AUTH_SECRET` | Random server secret, at least 32 characters; never `NEXT_PUBLIC_*` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth application configured for this origin |
| `HOSTED_ENGINE_REVISION` | Full 40-character worker image source revision |
| `CAREER_OPS_MODE=hosted` | Explicit local integration mode; Vercel enables it automatically |

Register `${BETTER_AUTH_URL}/api/auth/callback/google` in Google OAuth. Use a stable
preview alias if preview login is needed, not wildcard origins. Missing server
configuration produces a sanitized 503. A build does not need real credentials.
Database pools are reused within warm Function instances and bounded to three
connections; use a managed connection pool appropriate to the deployment scale.

For auth rate limits on Vercel, only the platform-provided
`x-vercel-forwarded-for` header is trusted. Local mode trusts no caller-supplied
IP header and conservatively shares the per-path bucket. Database rate-limit
storage survives Function instances. This is auth abuse protection, not model
spend/quota enforcement; job admission budgets are still required.

The app consumes a packed local `@hosted-career/control-plane` dependency.
`web/.npmrc` enables `install-links=true` so `npm ci --prefix web` installs it as
an ordinary package with its locked dependencies, rather than an outside-root
symlink. This is verified with a clean install and production Next build.

Run `npm --prefix web run db:migrate:hosted` explicitly using a migration-role
`DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` before serving traffic.
The command applies the checksummed control schema and the pinned SDK auth schema.
Use a migration pool of at least two connections: one holds the advisory lock.
Review generated auth schema changes when upgrading the SDK; never migrate on
request/startup. Configure least-privilege runtime grants separately.

## Evidence and remaining work

Synthetic integration tests use the actual SDK with test-only password options
to create sessions; that option is not in production configuration. They exercise
real cookie signing, PostgreSQL lookup, immediate revocation, CSRF, tenant denial,
idempotency, cancellation and input bounds. `HOSTED_TEST_WEB=1` additionally starts
the production Next server and uses two Playwright browser contexts to test actual
routes, database writes and rejection of legacy local endpoints. No Google login,
external model, paid resource or public deployment is used by those tests.

Known deployment work: legacy routes are blocked but still included in the Next
build, which emits four upstream broad-filesystem-tracing warnings. Prepare a
hosted-only build/package before deployment; do not bundle personal workspaces or
hide warnings by weakening isolation. The [job workspace](workspace.md) is now
implemented. Live private-storage
verification, Vercel-compatible worker execution, quotas, retention,
recovery UI and real Google OAuth verification remain incomplete.

Official references: [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next),
[database/migrations](https://better-auth.com/docs/concepts/database),
[rate limiting](https://better-auth.com/docs/concepts/rate-limit),
[Vercel request headers](https://vercel.com/docs/headers/request-headers).
