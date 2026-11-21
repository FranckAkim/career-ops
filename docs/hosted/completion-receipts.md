# Signed request resource-completion receipts

A Vercel Fluid instance can serve several invocations. Ending one request's file access is distinct from terminating its shared process. HTTP status, deployment READY state, elapsed time and absent logs are not sufficient deletion evidence. See [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) and [runtime logs](https://vercel.com/docs/logs/runtime).

The hosted request wrapper emits a signed `resource_work_complete` receipt only after handler work and response reads finish, or upstream cancellation completes. Export cancellation waits for pending storage reads. Uncertain cancellation emits no receipt. Emission precedes database settlement, so a failed settlement can leave an active marker with independently recoverable evidence in authenticated provider logs. If emission or logging fails, no completion authority is invented.

Receipts contain an opaque activity ID, server deployment/instance identity, project ID and informational timestamp. They contain no user ID, path, source text, cookie or credentials. The receipt uses HMAC-SHA256 with a domain-separated key derived from the existing server auth secret; no new provider key is provisioned. Timestamp comparisons between application and database clocks do not establish provenance. Signature validation and exact random activity/project/deployment/instance binding do. Matching signing material is required after rotation; missing material fails closed.

`vercelCompletionVerifier` accepts an operator-owned authenticated log reader scoped to project, deployment and activity. Its bounded parser ignores malformed, unsigned, foreign-context and mismatched evidence. A provider log line alone grants nothing without a valid receipt. The receipt digest is selected explicitly from the latest blocked-account activity review. Stale scope checks run again under account/request locks before an audit write.

## Operator review

1. Preview the already blocked account using `RequestReview`. Review the exact activity set and hash; do not target real accounts during development proofs.
2. Read authenticated Vercel runtime logs for the fixed project/deployment and opaque activity ID. The `CAREER_REQUEST_RESOURCE_COMPLETE` line contains that searchable ID and the signed envelope. Keep bounded evidence privately; do not publish logs or signing material.
3. Use `completionEvidence` with the protected signing material and exact database activity identity to obtain verified evidence digests. Configure `vercelCompletionVerifier` with the authenticated log-reading capability.
4. Resolve only the selected activity with `evidenceKind: 'resource_work_complete'`, its evidence digest, the current review hash, acknowledgement and `RESOLVE COMPLETED REQUEST` confirmation. The audit records that kind and the activity becomes `settled`. It is never labelled process termination. A completion receipt cannot satisfy the termination verifier/guard.

Migration 011 adds the distinct evidence kind to the existing operator-only audit. Neither runtime role gains access to that journal. The app exposes no public resolution route or deletion button. Log retention can remove evidence: missing/expired evidence leaves review unresolved rather than granting deletion permission. No paid drain or external evidence store is provisioned.

## Independent barriers and remaining work

These receipts do not prove provider-side upload settlement or coverage of older/untracked deployments. Purge now additionally refuses failed captures that already registered a snapshot: their uploads require separate operator review. Capture, job, container/workspace, shared-snapshot and inventory checks remain mandatory. Lost executions can use signed admission plus exact native timeout evidence as described in `provider-termination.md`. Generic crashes and missing admission/provider evidence still require review. All coverage reports continue to return false. Both unattributed historical snapshot groups remain protected.

## Verification

Unit tests cover signing/context binding, tampering, size limits, clock independence, cancellation ordering, failed settlement, provider lookup failures and refusal to emit on uncertain cleanup. Disposable PostgreSQL tests preserve an active marker after an injected local settlement failure, block purge, verify the signed receipt, record reviewed completion, refuse promotion to termination, and retain the opaque audit through an empty synthetic account purge. Production provider-log proof and CI evidence are recorded in `PROJECT_HANDOFF.md`.

## Production evidence - 2026-11-21

Migration 011 is installed. Source `17e8633745e809b734691e0c79711752fcf97d0d` passed Windows/Linux [CI 44924932065](https://github.com/FranckAkim/career-ops/actions/runs/44924932065). Production deployment `dpl_9HYWwoYZqC8VEeXhidfjXeke7pGx` is READY. A fresh file-free synthetic account completed two real authenticated hosted requests. Authenticated Vercel log queries retrieved each searchable receipt; protected signing material verified both signatures and exact project/activity/deployment/instance identities through the adapter. The helper then removed only its empty temporary auth/activity fixture.

No production marker was resolved, no operator resolution receipt was written, and no Blob object or real account was touched. The live proof establishes receipt production, provider-log retrieval and verifier behavior on normal completed requests. Failed database settlement and reviewed reconciliation are separately proven with disposable PostgreSQL; no deliberate production outage was introduced. Aggregate production audit observed zero active/unknown markers, zero review receipts and zero blocked live accounts. The local worker remained running with an idle queue and cloud inference disabled.
