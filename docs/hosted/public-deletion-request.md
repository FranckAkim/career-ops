# Public account-deletion request

## User contract

When HOSTED_DELETION_REQUESTS_ENABLED=1, Settings offers a reviewed request to block account access and queue operator-reviewed removal. It requires a sign-in within ten minutes, an unchanged personal sole-owner workspace scope, an acknowledgement and the exact phrase DELETE MY ACCOUNT. On acceptance all sessions are revoked and new account/workspace operations are blocked. The interface hides the workspace and states that removal is pending. It never says that data is already deleted.

This is a deletion request, not an unattended erasure service. The operator still establishes actual execution/writer coverage and runs the existing review/fence/purge capabilities for eligible data. Historical unknowns, shared/legacy references and uncertain unverified writers remain review barriers. Minimal security/audit metadata and content-free fence markers may remain; previously downloaded copies and provider backups/logs are outside this claim. Users with shared workspaces must obtain operator assistance. Automatic retention remains unavailable.

## Backend boundary

Migration 014 exposes only two fixed security-definer RPCs to career_web: recent-session preview and request. They qualify database objects, use a fixed search path, recheck server-derived user/session/tenant identity and scope under workspace/account locks, store an opaque review/session fingerprint, install tombstones, cancel/stop jobs and revoke sessions atomically. The private scope function and raw deletion/fence/purge ledgers remain inaccessible to the runtime; career_worker cannot execute request RPCs. The HTTP route derives identity from verified auth, permits no caller user/session IDs, enforces same-origin JSON and rejects unknown fields. Confirmation is checked before RPC submission. The runtime cannot resolve captures, cancel deletion or purge data through these RPCs.

The feature defaults off and rejects activation unless lifecycle, durable request tracking, capture inventory and generation uploads are all enabled. The relevant route is GET/POST /api/hosted/tenants/:tenantId/data-controls/account-deletion. Summary advertises availability only when enabled. No request is accepted merely by changing a frontend flag.

## Verification

All 48 control-plane unit checks, full disposable PostgreSQL suite and both web typechecks pass. Tests cover default-off routes, anonymous access, CSRF, foreign tenant, caller identity injection, missing confirmation, stale scopes, expired recent-auth window, shared ownership, private-scope denial to career_web, narrow RPC execution, session revocation, post-block refusal and a truthful 202 pending-review response. Source CI, production enablement and actual browser proof are tracked separately in PROJECT_HANDOFF.md. Migration 014 is installed; no real account was requested or blocked as part of setup.

Operator procedure: locate the exact pending account_deletion_requests row, inspect current scope and actual runtime drain, use RequestReview for trustworthy completion/timeout evidence where needed, SnapshotFencer only with genuine generation/writer evidence, and AccountPurger for eligible inventoried data. Do not supply unconditional verifier callbacks for real data. The two unattributed historical groups remain protected. Cancellation is operator-only before destructive fencing/purge and never restores old sessions or restarts jobs.

## Verified production flow — 2026-11-21

The feature is enabled in frontend production. Source a85b7e8 passed Windows/Linux CI 44962035339 and deployment dpl_E839SUUYyGxg2eSQ1yRYRxsvH7s9 passed a fresh synthetic end-to-end browser proof, including real local Qwen evaluation/tailoring, authenticated PDF/hash verification, anonymous denial, complete export and the public review/confirm/revocation flow. The receipt accurately stated pending review and replaced private workspace content. Its five snapshots/78 exact objects and app/auth records were then removed through the operator workflow; all 28 pre-existing manifest ETags were preserved.

The polished layout at source 6a27ac2/deployment dpl_F73a4MrevD3yGfqWYUWgagh9sXNJ passed a separate desktop/mobile, keep-account, wrong-phrase, explicit-confirmation and session-revocation proof. Its three-snapshot/23-object fixture was also removed while preserving pre-existing manifests. Both screenshots were visually checked. Physical removal continues to require operator review; Google OAuth audience publication is a separate unfinished release step.

Final Windows/Linux CI 44962944055 passed for the polished source 6a27ac27abcaec57d8b3bd181e6738bb7d8195dd.
