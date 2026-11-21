# Personal workspace data controls

Settings provides a JSON export and explicitly reviewed removal of unused profile draft records. Neither feature submits jobs to a model or claims full account deletion. Access is restricted to the signed-in owner of the personal workspace; members or owners of unrelated workspaces cannot use these endpoints for another account.

## Export format and scope

`GET /api/hosted/tenants/:tenantId/data-controls/export` returns a private, no-store attachment. Schema 1 contains the pinned current tenant generation, all published workspace versions, job payloads/results/statuses, the user's profile drafts, snapshot manifests and deduplicated file objects. Each file object carries `sha256`, `bytes`, `encoding: base64` and `data`. Resolve a manifest file to its object by SHA-256, decode its base64 contents and verify both hash and byte length. `complete: true` appears only after the stream finishes successfully.

The export includes historical published source versions, canonical trackers, reports and PDFs. It excludes authentication/provider credentials, sessions, worker journals, service logs and unpublished temporary uploads. It is a portable data archive, not an implemented restore/import feature. Downloaded copies are private data controlled by the user.

Metadata is captured while holding the tenant lock used by publishers. Immutable snapshot IDs pin the subsequent file reads even if another job finishes. Files are verified during streaming; corrupt/missing bytes fail the download rather than returning a successful complete archive. Cancellation stops further object reads. Limits reject oversized exports rather than silently truncating them: 1,000 workspace versions/profile drafts, 10,000 jobs, 10 MB job metadata, 2 MB profile content, 50,000 manifest entries/10 MB manifest metadata, 20 MB per file and 100 MB deduplicated file bytes. The existing 300-second route limit also applies. Larger exports need an operator-assisted path; do not claim an unlimited export.

## Reviewed draft removal

The status endpoint lists only unconfirmed draft IDs and review hashes. Discard requires an explicit checkbox and the exact reviewed draft set. The transaction uses onboarding's user lock, rechecks owner authorization and compares the current set before deletion. Changed drafts produce a conflict requiring another review. Confirmed profiles, personal-workspace pointers, published history, reports and PDFs cannot be removed by this action. Provider backups and physical database storage reuse are outside this operation; it does not promise immediate forensic erasure.

## Rollout

Frontend gate: `HOSTED_DATA_CONTROLS_ENABLED`. An unset gate hides the panel and rejects the new endpoints. No schema migration, new database grants, engine image change or worker restart is required. The existing web role already has the narrowly used draft-record delete privilege.

Ten control-plane unit checks pass. Disposable PostgreSQL verification passes for owner denial, archive coverage, deduplicated binary hashes, corrupt stream failure, stale review rejection and confirmed-source preservation. Full local browser/container integration passes for download, PDF hash, confirmation/cleanup, source/status preservation, reload, mobile and tenant/anonymous denial.

Production deployment `dpl_DFR7ZPpX2Fg9N8oGbUHo99y46BB5` at source `c075cb16b688e0ac50c74fcc0e16440b4e9ce3bd` is READY with the data-controls gate enabled. The live browser test verified every exported file against its hash/length, the existing binary PDF, historical published source versions, explicitly confirmed removal of one synthetic unused draft, preserved confirmed profile/tracker, reload/mobile width, tenant 404, anonymous 401 and revoked-session 401. Only synthetic data was used; the temporary draft and test auth records were removed. No model job or private object upload was created. CI results are recorded in the shared handoff.

Full account deletion and automatic retention remain unavailable. Read `deletion-design.md` for the required snapshot ownership inventory, tombstones, capture leases and cross-tenant deletion checks before implementing them.
