# Historical storage reconciliation

Migration 006 adds an operator-only, resumable observation journal. `StorageReconciliation` lists metadata under the fixed `career-workspaces/v1/` prefix and compares observed snapshot groups with committed database references and capture records. It does not upload, read CV/PDF bodies, change workspace pointers, assign owners or delete objects. No public API, user-facing deletion control or web/worker table grants are introduced.

The storage boundary strips Blob URLs/download URLs. The journal stores validated snapshot/file hashes, key fingerprints, sizes and upload timestamps. Unrecognized keys are retained only as fingerprints, without candidate filenames. Each page and its next cursor commit together; retries deduplicate observations and mark changed metadata. Concurrent checkpoint changes fail instead of overwriting progress. Provider errors retain the prior cursor and a fixed error category. Scans stop after 1,000 pages; incomplete/failed scans never become complete reports.

Reports distinguish committed references, unresolved captures, tracked unpublished snapshots, changed/recent groups, unattributed groups and unrecognized keys. They flag committed manifests not observed in the listing and unresolved/expired captures. Pagination completion is an observation boundary, not an atomic storage snapshot or deletion authorization. References/captures can change during a scan; future deletion must recheck them with lifecycle locks. Unknown ownership and expired leases are never treated as permission to purge.

## Production result, 21 November 2026

The first scan completed in one page with 632 objects across 26 snapshot groups:

| Classification | Groups | Objects | Bytes |
|---|---:|---:|---:|
| Committed reference | 24 | 622 | 2,643,868 |
| Unattributed | 2 | 10 | 1,907 |

Zero committed manifests were absent from the listing. There were zero unresolved captures. Both unassigned groups have verified manifest metadata and all file objects declared by those manifests were present in the listing, with no unexpected file hashes. One carries canonical profile-provenance metadata; the other does not. Neither carries a job receipt. These markers alone do not establish ownership, and no owner was assigned. No CV/PDF contents were read and no private object was deleted.

Only the database owner can read/write the reconciliation journal; the live web and worker roles were verified unable to SELECT it. Migration 006 preserves previous migration checksums and grants. The existing worker, engine images and cloud-disabled configuration are unchanged.

## Verification and next work

Eleven unit checks and disposable PostgreSQL integration pass. Tests cover metadata privacy, invalid paths/timestamps, duplicate pages, mutated objects, interrupted/resumed scans, partial/unknown objects, concurrent cursor fencing and absence of implicit ownership/deletion. Source `38dd0045ec676edcd09ce360c79f5ba4723307e2` passed both Windows and Linux jobs in [CI 44879174771](https://github.com/FranckAkim/career-ops/actions/runs/44879174771). The durable production scan journal completed with the results above; runtime-role access was verified denied.

An operator must review the two unattributed groups using bounded provenance/database evidence before making any ownership or purge decision. Keep them protected meanwhile. Next implement account/workspace tombstones, an explicitly confirmed deletion scope, execution/capture draining and idempotent exact-key purge with live reference checks. Full account deletion and automatic retention remain unavailable; read `deletion-design.md` and `snapshot-inventory.md`.
