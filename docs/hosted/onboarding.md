# Reviewed profile onboarding and private snapshots

The hosted entry point is `/hosted`; hosted `/` redirects there. Legacy local
pages/APIs stay blocked. A separate minimal root layout skips local follow-up
files and dashboard navigation. The original local dashboard remains available
in local mode. The working product name is Career Workspace; Vercel is the target.

The interface supports Google sign-in, draft resumption, profile entry/editing,
exact-text review, explicit confirmation and persisted completion. Live Google
sign-in still needs credentials/callback setup; tests use real SDK-signed sessions
for synthetic users. Nothing is publicly deployed.

## Facts and review

This intake path accepts **pasted CV text/Markdown**, full name, optional target
role and output language. It does not parse binary documents, call a model, infer
achievements or generate facts. An identity-prefilled name remains editable and
part of the review. Only explicit confirmation promotes the text to an engine
source. Uncertain claims can be edited/removed; no invented numeric claim is
presented as a forced confirm/deny choice.

Private PostgreSQL drafts are separate from engine workspaces. The review screen
shows the server-returned normalized draft (CRLF becomes LF). Confirmation binds
its content hash and acknowledgment. A stale review returns 409. Draft creation
is capped at five unconfirmed drafts per account; the UI resumes the latest one.
Confirmed profiles cannot be changed through draft endpoints. Future profile
updates must use tenant mutation leases and fenced snapshot publication.

## Endpoints

All routes use existing session/Origin/body-size safeguards and private/no-store
responses. User IDs come from verified sessions, never request JSON.

| Method | `/api/hosted/` suffix | Behavior |
| --- | --- | --- |
| GET | `onboarding/status` | Personal workspace or null |
| GET | `onboarding/drafts` | Latest five own unconfirmed draft IDs/metadata |
| POST | `onboarding/drafts` | Save `{fullName,cvMarkdown,targetRole,language}` |
| GET | `onboarding/drafts/{id}` | Own draft; other user's draft returns 404 |
| POST | `onboarding/drafts/{id}/update` | `{expectedHash,profile}`; reject stale/confirmed edits |
| POST | `onboarding/drafts/{id}/confirm` | `{expectedHash,acknowledged:true}`; create workspace |

CV text is limited to 200KB; enclosing JSON remains limited to 256KB. Names/target
roles reject control characters. Unknown fields and caller workspace paths are
rejected. Language comes from the bounded UI list.

## Publication and provenance

Migration 002 adds drafts, personal-workspace uniqueness and query indexes.
Migration 001's checksum/content is preserved. Versioned migrations remain
transactional/locked; the packed dependency includes SQL for the operator command.

Confirmation builds disposable private `cv.md`, JSON-form YAML `config/profile.yml`,
empty strict fact-check configuration, user-stated target, an empty tracker and
`config/confirmed-profile.json`. Provenance binds user, draft, revision, review
hash and confirmation time. The empty tracker is a generation-zero scaffold;
subsequent application writes still use canonical engine scripts. Tests run its
actual parser/evaluator/merger against this scaffold.

The service uploads/verifies the snapshot outside a DB transaction, then locks
and rechecks the draft and atomically creates tenant, owner membership, generation
zero, personal-workspace link and confirmation marker. A per-user advisory lock
and unique personal-workspace key make concurrent confirmations converge on one
workspace. Replays return its existing ID. Changed drafts/storage failure cannot
publish a workspace. Private orphan uploads need future coordinated GC preserving
all committed/recovery/active-reader references; no cleanup cron is introduced.

## Vercel Blob

`BlobSnapshotStore` implements capture/materialize/verify/read using pinned
`@vercel/blob` 2.9.0. Every SDK operation requests private access. Writes disable
overwrite/random suffixes. Object keys contain hashes rather than candidate
names. Duplicates/lost upload responses require existing-byte verification.
Downloads are bounded/hash-checked. The manifest is uploaded last and verified
before any database pointer is committed.

Preferred Vercel setup: a connected **private** Blob store with `BLOB_STORE_ID`
and platform OIDC credentials. `BLOB_READ_WRITE_TOKEN` is a server-only fallback.
No store was provisioned and no live Blob request was made. Tests use an in-memory
SDK transport; verify actual store privacy/OIDC/latency before deployment. Never
fall back to public storage.

Local integration may set an absolute private `HOSTED_DEVELOPMENT_SNAPSHOT_ROOT`.
Vercel ignores this fallback. Missing remote storage still permits draft review,
but confirmation fails closed with a recoverable message. Temporary disk is
disposable staging, not Vercel's durable source of truth. Storage credentials stay
outside AI workers. Large transfers need measured limits/durable execution.

## Evidence and remaining work

- Four snapshot tests cover private SDK options, immutable duplicate writes,
  binary round trips, corruption, failed manifest publication and local limits.
- Real PostgreSQL tests cover ownership, acknowledgment, stale edits/reviews,
  four concurrent confirmations yielding one workspace, provenance, storage
  outage, edits during upload and real engine evaluation compatibility.
- Production Next + Playwright tests cover draft resumption, editing, review,
  disabled confirmation before acknowledgment, workspace contents, reload/mobile
  behavior, guest sign-in, tenant denial and blocked legacy endpoints. All data
  is synthetic; no real provider or paid service is used.

Still needed: job/report/PDF UI and authorized artifact delivery, optional binary
intake, leased profile updates, retention/deletion, storage/model quotas,
hosted-only packaging, Vercel-compatible isolated worker execution, live Blob/OAuth
checks and real-model quality/budget evaluation. The prior full upstream web-suite
Windows caveats remain in PROJECT_HANDOFF.md; targeted checks do not establish
that all upstream web tests pass.
