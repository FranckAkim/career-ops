# Failed capture inspection

`CaptureReview` is an operator-only, read-only diagnostic for a previously reviewed and blocked account. It does not resolve captures, delete objects, or authorize purge. No HTTP endpoint, runtime grant or database migration is added.

The inspector reads the exact failed/unfinished capture scope and its registered object inventory. For valid non-legacy failed captures belonging to the target, it checks only the inventoried file hashes and manifest through the storage boundary. It returns counts of observed present/missing objects; storage URLs, ETags and file content never leave that boundary. Active, unregistered, foreign, legacy or malformed records remain explicitly unresolved. Results are bounded to 1,000 captures and 10,000 unique object checks. Provider errors and malformed HEAD metadata fail closed. The exact database scope is compared again after storage reads, and changes reject the report.

A missing object does not establish that a previously timed-out upload cannot finish later. Neither repeated HEAD calls, SDK promise rejection, request completion, lease expiry nor elapsed time proves remote upload settlement. The report always returns `uploadSettlementVerified: false` and `purgeAuthorized: false`. The existing `capture_failure_review_required` purge barrier remains in effect. It is an observation for a subsequent evidence-backed operator review, not a reconciliation receipt.

Next implementation needs provider-backed evidence that every potentially submitted write is terminal, or an independently verified revocation/fencing protocol covering all writers and in-flight provider operations. No such authority is inferred from an object listing or this report. Historical captures lacking operation identity stay unresolved. Both unattributed historical groups remain protected.

Five focused tests cover exact-key selection, capability filtering, absent objects, unresolved inventory, provider errors, malformed metadata, stale scopes, account blocking and size bounds. These use synthetic in-memory storage and do not access production accounts or Blob objects.

The full disposable PostgreSQL suite also passes: actual capture/inventory joins, stale-scope rejection and refusal of purge after an all-missing inspection were verified. All 39 control-plane unit tests pass. Production storage was not queried.

The current [Blob abort documentation](https://vercel.com/docs/vercel-blob/examples#aborting-requests) describes client cancellation; this review does not interpret it as a guarantee that an already submitted remote write cannot commit later. That stronger guarantee remains unverified.

A separately tested [retained write-fence prototype](blob-write-fence.md) offers a possible alternative to remote terminal-operation evidence. It is not wired to this inspector or purge. Generation-aware snapshot identity and durable shared-reference/fence handling are required before integration.
