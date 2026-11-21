# Account lifecycle blocking foundation

Migration 007 implements operator-only reviewed account blocking and database fences. It does not provide a public deletion request or deletion button. Blocking returns `deleted: false`. Migration 008 now provides a separate operator-only resumable purge and completed state for eligible fully inventoried accounts; see `account-purge.md`. Blocking alone never means erasure.

## Review and blocking

`AccountLifecycle.preview` computes a bounded scope hash from the sole-owner personal workspace, current generation/snapshot, profile records, jobs and captures. Shared/multiple workspaces and oversized scopes require operator review. A request requires the exact scope hash, explicit acknowledgement, the confirmation text and an existing session created within ten minutes that is not expired. A scope change requires a new review. Exact retries have an audit fingerprint; bearer tokens are not retained.

The request locks the tenant before the user, creates account/workspace tombstones, cancels queued jobs, requests cancellation of running jobs and revokes all sessions. The worker can still heartbeat/finish cancellation and mark interrupted captures failed. New jobs/captures, source versions and successful publication cannot pass the guards. Fresh sessions are refused by both the pinned Better Auth hook and a database trigger, closing the late-session race.

Database guards serialize through the same tenant/user ordering as writers. Capture registration acquires its tenant lock before capture/object locks. Source/profile/session writes cannot cross a committed block through an older client lacking the new application check. Queue claiming also excludes blocked workspaces when lifecycle checks are enabled.

Operator cancellation clears only the matching request's blocks. It does not restore revoked sessions, restart cancelled jobs, resume interrupted model work or erase source data. Operator-only exact object deletion and final verification are implemented in the purge module. Durable remote-request tracking is implemented in migration 009; old-deployment coverage, abandoned-request resolution, public flow eligibility and backup/retention disclosures remain required before exposing self-service account deletion.

## Activation and access

- Frontend/cloud runtime flag: `HOSTED_ACCOUNT_LIFECYCLE_ENABLED=1`.
- Local private config: `accountLifecycle: true`; refresh the packed control-plane package before restart.
- Web/worker roles receive SELECT on the two tombstone tables, atomically with migration 007. The request journal and all block/cancel writes remain operator-only. No new public endpoint is added.
- Existing auth tables get their session trigger in migration 007. Fresh operator/test auth installation adds it after SDK schema creation; no schema changes run in request handlers.

Production migration 007 installed eight guards with zero accounts blocked. The frontend checks and local-worker checks are enabled. Source `6144d93bbcd3c5e8554545413d62db553ada604e` passed Windows/Linux [CI 44908519887](https://github.com/FranckAkim/career-ops/actions/runs/44908519887). Deployment `dpl_88eh7XqhV7iVC4qsQdtQkArHdnRu` is READY.

## Verification

Disposable PostgreSQL tests pass for recent-auth/confirmation requirements, changed scopes, replay, revoked sessions, denied re-login, database session/source/version/capture fences, legacy-client job rejection, queued/running cancellation, shared-workspace refusal and explicit operator cancellation. The normal lifecycle-enabled browser/container flow also passes for onboarding, profile changes, PDFs, export, recovery and capture publication.

Live proof used a fresh synthetic account only. It verified blocking, revoked-session 401, denied re-login and job/capture/source writes, unchanged generation/snapshot, explicit cancellation, old-session invalidity and fresh-session no-AI local-worker publication. The synthetic block was cancelled and temporary auth records removed. No real account was blocked, no source/profile/document was purged and no Blob was deleted.

## Legacy provenance and worker maintenance

Bounded metadata review of the orphan containing a profile marker found no matching draft identity/hash/revision, personal workspace or auth identity. The second orphan has no marker. Neither is assigned an owner or approved for deletion. Keep both protected; see `storage-reconciliation.md`.

Docker Desktop had stopped between sessions and was restarted. The worker's scheduled launcher also referenced a removed, versioned Codex PowerShell bundle after an app update. It now uses Windows' stable `System32/WindowsPowerShell/v1.0/powershell.exe`, with hidden, limited-user, on-demand execution and UTF-8 private logs. No sign-in trigger or new privilege was added. The task is running with the existing reviewed engine/model configuration.
