# Durable hosted request draining

Migration 009 and `HOSTED_REQUEST_DRAIN_ENABLED=1` track authenticated hosted API requests before they can read or mutate workspace data. Admission uses the same account advisory lock as blocking. A request either enters before the block and remains visible, or is rejected after it. Authentication/session-only framework handlers do not access workspace storage; session creation remains protected by the existing lifecycle guard.

The request marker remains active until handler work and its response body finish. Response cancellation waits for upstream cancellation. Export cancellation also waits for any outstanding private-storage read. A database settlement error, lost process or uncertain cleanup leaves an unresolved marker. Time passing never grants permission to purge. Only operator-reviewed evidence of actual termination may resolve abandoned markers; no automatic resolver or public override exists.

Purge checks active markers while holding the account lock, both before physical deletion and before final database cleanup. Settled request metadata is removed with the target's app/auth records. The web role can admit and settle requests but cannot delete activity rows; the worker role has no activity-table access. Rows contain opaque identifiers and timestamps, not URLs, cookies, source text or response contents.

## Activation boundary

Install migration 009 before enabling the frontend flag. Confirm the deployed build includes this module and test real authenticated responses. A new deployment does not prove older deployments or already-running untracked requests have stopped. Confirm those executions are drained before treating the ledger as complete deletion evidence. Preserve the independent local-container/workspace and cloud-attempt drain checks. Do not expose public deletion until deployment coverage and orphan-request resolution are designed and verified.

## Verification

Unit tests cover streaming completion, cancellation during a pending read, cleanup/settlement failures and unauthenticated/failed handlers. Disposable PostgreSQL tests cover an actual admission/block transaction race, post-block refusal, an arbitrarily old unresolved marker, immutable activity identity, restricted grants and purge refusal while a request is active. The authenticated HTTP suite runs with tracking enabled. Export integration checks prove cancellation waits for its storage read. Production activation evidence is recorded in `PROJECT_HANDOFF.md`.
