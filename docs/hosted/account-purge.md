# Operator-only inventoried account purge

The operator purge implementation is verified for fully inventoried, sole-owner accounts. It is not exposed through a public API or deletion button. Read `account-lifecycle.md` before using it: a reviewed block and revoked sessions must precede purge.

## Eligibility and execution

Migration 008 adds an operator-only resumable item ledger and serialization of snapshot references with deletion. Neither runtime role can access the purge ledger. The purger requires complete non-legacy owner capture inventory, no unresolved capture or active execution, and a trusted drain verifier. The local verifier refuses namespace containers, nonempty disposable workspaces, unsafe paths and Docker errors. The operator must separately establish that remote frontend requests have settled; this is not yet an automated public deletion barrier.

Snapshot references are rechecked under database locks. Foreign committed references, job bases and capture owners preserve shared snapshots. Missing provenance or legacy inventory requires review. Deletion derives exact file keys from validated hashes, uses conditional ETags, removes the manifest last and verifies absence. Only the SDK's typed not-found response establishes absence; provider outages fail closed. Durable progress supports retries and lost delete responses. Cancellation is unavailable once purge starts.

Finalization removes the target's application and authentication records only after object verification and another drain check. Minimal opaque tombstones and purge/security metadata remain. This does not promise erasure of provider backups, security logs, verification records or user-downloaded exports. Automatic retention and public self-service deletion remain unfinished. The two historical unattributed groups remain protected and are not approved deletion targets.

## Verified production evidence — 2026-11-21

Source `9bfa41af0bc33ba747e7ab637f10b44f7055e595` passed both Windows and Linux [CI 44912920935](https://github.com/FranckAkim/career-ops/actions/runs/44912920935). Production deployment `dpl_3UK9mjGJD9p282DhPfpYzKE3UeZ4` is READY and migration 008 is installed. Runtime roles have no purge-ledger access.

A fresh synthetic example.test account completed onboarding, reviewed profile publication and a no-AI local-worker sync. After a reviewed block, its revoked session returned 401. Purge removed three inventoried snapshots comprising 23 exact objects, verified object absence and removed the target's app/auth records. All 28 pre-existing snapshot manifests retained their original ETags, including both unattributed historical groups. No real account was targeted. The minimal security tombstone remains intentionally.

Disposable PostgreSQL tests cover restart/retry, failed deletes, lost responses, storage verification errors, unresolved captures, runtime drain refusal, legacy inventory refusal, shared snapshots, an actual concurrent foreign-reference transaction and re-registration with a new identity. Local drain tests cover containers, workspace contents and daemon failure. The operator-local worker remains running; cloud inference stays disabled.
