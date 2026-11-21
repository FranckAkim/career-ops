# Account deletion and retention: implementation boundary

Full account deletion is not implemented or advertised as available. The next required backend change is ownership tracking for every snapshot capture, including captures that never publish. Do not implement deletion by removing an auth row or recursively deleting a workspace prefix.

## Evidence from current storage

`BlobSnapshotStore` stores objects under a content-addressed snapshot ID. Identical snapshots can be referenced by more than one tenant or generation. Files are immutable inside that snapshot prefix. `workspace_versions`, `tenants.snapshot` and in-flight job bases identify committed references, but an upload can fail before any database pointer is published. Initial profile creation, profile edits and supervised jobs all capture snapshots. Deleting only committed references would miss unpublished objects; deleting a shared snapshot could destroy another tenant's data. Downloaded user copies and provider backups are outside active application storage.

## Required implementation sequence

1. Add a durable capture/object inventory with owner identity, snapshot ID, capture lease and lifecycle state. Register ownership and the upload intent before storing any private bytes. Cover onboarding, profile publication and both supervisors. Existing objects require an operator-reviewed reconciliation; list metadata first and avoid logging source contents.
2. Add a deletion request record and an account/workspace tombstone. Show a server-computed scope for explicit confirmation with recent authentication. Block source publication, queue admission, new captures and session access for the tombstoned scope. Refuse destructive workspace removal where other members require an ownership transfer.
3. Cancel queued jobs and stop/fence active execution, then verify owned containers and disposable workspaces are gone. A live capture lease or another tenant's reference prevents physical removal.
4. Remove app records in foreign-key-safe order and revoke sessions/provider credentials. Retain only the opaque deletion request and the minimum IDs needed for unfinished cleanup. The cleanup worker must be independent of the deleted account's auth session.
5. Purge inventoried private objects only after checking all remaining committed references and capture leases. Coordinate deletion with capture/publication so a newly referenced snapshot cannot be removed after a stale reference check. Use exact object keys derived from validated inventory, never caller-selected paths or broad storage prefixes.
6. Verify object absence and absence of remaining app/auth data. Retry uncertain provider responses idempotently with fixed error categories. Mark completion only after verification; distinguish active-store removal from provider backup expiration and user-downloaded copies. Publish only retention periods supported by actual configuration and provider evidence.

## Required proof before activation

Use isolated synthetic accounts: sole owner, other tenant sharing a snapshot, unfinished upload, crash before/after DB publication, active job/capture, repeated deletion requests, lost object-delete response, storage outage, revoked/foreign session, and a newly created account after deletion. Verify no new model work runs, no other user's snapshot/file disappears, deletion remains recoverable after process/database restart, and all temporary test identities are removed. Never use the real operator account as the destructive test target.

## Available first step

The gated data controls export the personal workspace's published source versions, profile drafts, job records and files with deduplicated base64 contents and SHA-256 hashes. They also discard explicitly reviewed unconfirmed profile draft records. These operations do not claim full account erasure or automatic retention. Historical profiles and generated documents remain stored.
