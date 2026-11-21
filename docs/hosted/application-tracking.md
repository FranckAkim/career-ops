# Canonical application tracking

The Applications view reads application stages from the latest committed workspace generation. It does not maintain an independent tracker. `set_status` calls upstream `set-status.mjs` with an expected row identity and previous status, then publishes the changed workspace using the existing lease fencing and generation compare-and-swap. A conflicting edit requires explicit recovery; it cannot overwrite a newer status.

`sync_applications` initializes projections from older saved workspaces without an AI call. New evaluations, CV preparation, syncs and status changes all return a tracker projection. Immutable status receipts contain per-job copies of the tracker and ledger, preserving older evaluation/PDF receipts.

Applied requires confirmation that the user has already submitted the application. Saving a stage never submits anything. Interview updates require an embedded posting archive before invoking the canonical hook, preventing external posting fetches. Canonical state parity is tested against `templates/states.yml`.

The UI provides current Applied, Interview, Offer and Hired counts, company/role search, status filters, publication progress and responsive navigation. These are current-stage counts, not lifetime funnel conversions. Unknown imported states are shown for review and cannot be edited through the form. The projection is bounded to 1,000 rows, with 100 matching rows rendered.

## Verification

- Engine/status/worker tests: five pass, including replay, stale edits, input rejection, unchanged source CV and no model/posting calls for status/sync operations.
- Control-plane unit checks: eight pass. Local-worker checks: four pass, including explicit revision-to-image routing.
- Disposable PostgreSQL and isolated container/browser flow passes: canonical Applied/Interview publication, stale-update recovery, tenant denial, two tenant PDFs, download integrity, reload, filtering, mobile width, cancellation and recovery.
- Frontend build/type checks and source/dependency boundary checks pass. Both Windows and Linux jobs pass in [CI 44873454093](https://github.com/FranckAkim/career-ops/actions/runs/44873454093) at frontend source `c13459a5431da0953fd4e143d1cdc192c5d75914`.
- Reviewed engine revision: `1b2d1b72da7b5665d33da7ec1f71e4bd7ba9a4a6`. Local immutable Docker ID: `sha256:f42270ce2f91b51b5ceec3f7796e9db7e4b4e86b5936c984164ebd558242b969`. Local runtime verifies the image revision and non-root user, and retains the prior reviewed `73e7202` image for rolling compatibility.
- The upgraded production worker published the existing synthetic tracker through `sync_applications` without an AI operation. Frontend deployment `dpl_S68x64mCpRnApM6P6FthwvgN25mr` is READY with `HOSTED_APPLICATIONS_ENABLED=1` and the new engine pin. Live production browser checks pass for Applied confirmation and publication, Interview publication, reload persistence, filtering, mobile width, unchanged prior PDF hash, cross-tenant tracker 404, anonymous 401 and revoked-session 401. Only synthetic fixture data and temporary test auth records were used; those auth records were removed. No application was sent.

Google login remains limited to configured test users. Profile editing, retention/deletion and broader beta access remain separate work.
