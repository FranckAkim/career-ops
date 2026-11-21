# Durable snapshot capture inventory

Migration 005 adds private `snapshot_objects`, `snapshot_captures` and `snapshot_legacy_references` tables. New captures record owner, operation context and a lease before capture/storage work starts. Before the first private object upload, the fixed storage adapter registers the exact snapshot ID, unique file hashes, file count and total bytes. No candidate text, source filenames, provider credentials or host paths are copied into this inventory.

## Capture and publication

Capture states are `preparing`, `uploading`, `ready` and `failed`. A heartbeat renews a live lease; loss stops subsequent upload steps and prevents successful capture completion. Partial/uncertain failures retain the registered snapshot/object identity and owner. A process crash leaves an unresolved record. An expired lease never grants deletion permission by itself: the owning writer must be confirmed stopped before cleanup.

`ready` means the stored snapshot was verified, not that it was published. Publication checks a ready capture against its owner, kind, tenant, job ID and claim fence as applicable. Object/capture share locks cover the database pointer change. Object states `deleting`/`deleted` prevent new uploads and publication. Separate owners can hold capture records for one immutable snapshot ID.

Onboarding uses a user-owned capture before a tenant exists. Reviewed profile edits use owner/tenant captures. The common supervisor wraps job captures for both operator-local containers and the cloud Sandbox runner. When strict queue mode is enabled, publication without matching capture proof fails. The engine image and canonical file writers remain unchanged.

## Activation

- Frontend and cloud-worker configuration: `HOSTED_SNAPSHOT_INVENTORY_ENABLED=1`.
- Operator-local private configuration: `snapshotInventory: true`; refresh the packed control-plane dependency and restart the idle worker after migration/grants.
- Runtime roles get SELECT/INSERT/UPDATE on the object/capture tables and SELECT on historical references. Public grants are revoked. No deletion privilege or deletion endpoint is introduced.
- Cloud inference remains disabled. Wiring inventory into its runtime does not authorize new cloud model or Sandbox execution.

Production migration 005 preserved the existing data and recorded 21 legacy snapshot IDs and 23 committed tenant/snapshot reference pairs, with zero missing historical reference pairs at migration time. The prior four migrations/checksums were unchanged. Legacy rows intentionally have unknown object metadata until reconciled; they are not fabricated successful captures or historical ownership proof.

## Verification and remaining work

Disposable PostgreSQL tests cover shared owners, durable registration before Blob transport, partial uploads with a missing manifest, object-state fencing, expired unresolved leases, heartbeat interruption, strict publication proof and integrated onboarding/profile/no-AI job captures. The complete inventory-enabled browser/container flow passes through real PDF generation, reviewed profile publication, export, cancellation, recovery and tenant/session denial.

Production deployment `dpl_2dMpYjfAeRKMFQJqXaFXfC1KXvNA` at source `025aaa0ba2d8904ccaa66e1f2260b53426a40ccd` is READY. Both Windows and Linux checks passed in [CI 44877497228](https://github.com/FranckAkim/career-ops/actions/runs/44877497228). The frontend gate and local-worker configuration are enabled; the idle local worker was upgraded and remains running with the same reviewed engine images. The cloud inventory flag is configured, while cloud execution remains disabled (valid authenticated wake returns 503).

Live proof used a new temporary synthetic account: onboarding, a reviewed profile revision and one no-AI local-worker sync produced exactly three ready owner/context-matched capture records with registered object hashes and completed leases. Historical export hashes, reload/mobile and session revocation passed. Temporary auth records were removed. The final metadata-only audit found zero committed references lacking either a historical reference record or a matching ready capture; this is not proof that historical unreferenced uploads have all been found. The web role has inventory SELECT/INSERT/UPDATE and no inventory DELETE privilege.

Full account deletion and automatic retention remain unavailable. Historical unreferenced uploads still require metadata-first reconciliation; no existing private object has been deleted. Future cleanup must check both committed references and capture ownership/leases, coordinate with the object-state locks, and enforce account/workspace tombstones. Read `deletion-design.md` before implementing purge behavior.
