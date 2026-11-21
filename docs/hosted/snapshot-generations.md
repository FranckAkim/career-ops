# Generation-aware snapshot manifests

## Implemented contract

The local and Blob snapshot stores support an opt-in constructor option `generationSnapshots: true`. Each capture creates a schema-2 manifest containing a freshly generated server UUID v4 and the existing validated file inventory. Its SHA-256 remains the snapshot ID, so the existing 64-hex database/reference/key contract is unchanged. File content hashes and verification are unchanged. The generation has no user-supplied identity, timestamp or personal information.

Schema-1 capture remains the default and retains content deduplication. Updated readers accept both schemas. Schema 2 requires a string UUID v4; schema 1 must not contain a generation field. The complete manifest, including generation, is hash-verified before files are trusted. Unsupported schemas and malformed generations fail closed. Generation creation is private to the store; callers cannot select or reuse a generation.

Identical content captured again in generation mode gets a different snapshot ID and storage prefix, even within the same account. This intentionally trades cross-capture deduplication for independent retirement. Existing snapshots are not rewritten. No database migration or new path family is needed. Generation-aware snapshots still share safely if an existing committed snapshot reference is deliberately reused; foreign-reference preservation remains mandatory.

## Verification

All 46 control-plane unit tests pass. Local and fake-Blob tests cover legacy reads, identical-content independence, materialization, tampering, malformed generations and new captures after an old generation's content is replaced with a synthetic fence. The full disposable PostgreSQL suite passes, including registration before upload, independent inventory identities, successful publication of a fresh identical generation and refusal to publish the retired one. Hosted typecheck passes.

No production data was rewritten, generation upload was enabled, runtime option was changed, worker image rebuilt or account purge authority broadened. Existing process instances may still have old readers loaded; deploying source alone does not establish complete reader coverage.

## Rollout requirements

Before the first generation-mode upload, deploy and verify both reader versions in the frontend and every active supervisor, including restarting long-lived local worker processes. Keep all existing engine/source compatibility mappings: the sandbox engine receives materialized workspace files rather than the storage manifest, but the supervisor doing that materialization must support schema 2. Test a synthetic full user journey before activation. Add explicit production/local configuration gates and reject generation mode without capture inventory. A mixed population of legacy and generation snapshots is expected.

The retained write fence remains experimental and disconnected from purge. Next integration requires durable generation-aware fence ledger states, owner/reference locks, resumable marker verification, known immutable-writer coverage and accurate retained-marker disclosure. Historical uncertain captures and privileged/untracked writers remain unresolved. Do not equate a fresh generation ID with upload settlement or deletion authorization.
