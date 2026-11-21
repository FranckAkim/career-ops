# Experimental retained write fence

`BlobWriteFence` is an operator-only experimental storage primitive. It is not connected to capture reconciliation, account purge, runtime grants or an HTTP endpoint. Existing failed-capture barriers remain unchanged.

## Mechanism

The primitive reads a single exact inventoried key. For an existing object it conditionally replaces content using the observed ETag; for an absent key it creates a marker without overwrite. It verifies the retained marker bytes through a private uncached read. Lost replies require the same verification; provider errors, races, malformed metadata and arbitrary paths fail closed. No original content or storage capabilities are returned. A retained marker prevents subsequent immutable creates at that pathname. It does not prove that an upload is terminal, revoke credentials or fence privileged unconditional overwrites. It always reports uploadSettlementVerified=false.

This follows the documented [conditional write](https://vercel.com/docs/vercel-blob#conditional-writes) and [no-overwrite](https://vercel.com/docs/vercel-blob/using-blob-sdk#put) contracts. It is an alternative to assuming that cancellation proves remote settlement. The marker must not be deleted while delayed immutable creates remain possible. SDK reads bypass the cache, but previously cached/downloaded bytes are not erased by this operation; normal provider cache/backups/log limitations remain.

## Verification

Four focused tests exercise existing/missing keys, late creates, stale ETags, changed-object races, lost replies, outages, malformed metadata and path rejection. All 43 control-plane unit tests pass. The previous full disposable PostgreSQL suite passed for the capture inspector; no database behavior was changed by this primitive.

A live synthetic test used two fresh keys exclusively under `career-write-fence-proofs/v1/<fresh UUID>/`, outside `career-workspaces/v1/`. It verified sealing an existing object and an absent object, rejection of two subsequent immutable creates, rejection of a stale conditional overwrite, and retained marker contents. Only two small synthetic markers remain in that separate proof namespace. No production snapshot, account, database record, credential configuration or protection setting was changed. The proof covers these operations and ordering; it does not certify arbitrary already-running provider operations or global writer coverage.

## Required before purge integration

Current snapshot identities are globally content-addressed. Permanently sealing an old hash could deny a later legitimate upload of identical content, even from a new account. Do not enable fencing in purge without designing generation-aware object identity and preserving shared snapshots. That change must coordinate manifest/storage addressing, references, immutable engine compatibility, inventory, publication locks, resumable purge and legacy reads. Do not silently change the meaning of snapshot IDs.

Integration also requires a durable operator-reviewed exact-key ledger, retained-marker state distinct from deleted/absent, a complete immutable-writer contract, reference serialization and recovery tests. The public product must describe retained minimal storage markers accurately. Historical captures with unknown writers and the two unattributed groups remain protected. This primitive grants no account-deletion authority.
