# Durable control plane (private integration milestone)

This package orchestrates the existing JSON worker. It exports a framework-neutral
authenticated HTTP handler mounted by the Next.js app; it starts no HTTP server.
See [the auth/API guide](../../docs/hosted/auth-api.md). Use a dedicated private PostgreSQL
database and a server-only pool. Never place its database credentials, snapshot
store, Docker socket or modules inside the worker container.

`npm ci --prefix hosted/control-plane --ignore-scripts` installs the pinned driver.
`migrate(pool)` applies the transactional, checksum-checked initial schema; future
changes require new migrations, not edits to a deployed migration. Default pg
bigint parsing must remain string-based to preserve fence/generation precision.

## Data and state transitions

Tenants own memberships, jobs, progress events, workspace versions and artifact
metadata. User-facing `enqueue`, `read`, `cancel` and `discardRecovery` methods
check membership; `userId` must come from verified server authentication. These
methods are not substitutes for that authentication. `provision`, worker claims,
heartbeats, publication and reaping are trusted internal capabilities. No public
database grants or browser database access are introduced. Before deployment,
create separate migration/runtime roles with least privileges; the integration
test uses the disposable database owner. No RLS claim is made for this trusted
service-role design.

Enqueue and its progress event commit together. The jobs table itself is the
durable queue, so a separate broker/outbox dispatcher cannot lose a job between
database commit and dispatch. Poll `claim()` from a bounded number of supervisors;
run `reapExpired()` periodically in the same service. Empty polls need backoff.
No scheduler or public service is started automatically by this package.

Tenant-row locks serialize mutations; `SKIP LOCKED` allows different tenants to
run concurrently. Every transaction locks tenant before job, uses bounded SQL
execution, and finishes before model/container/storage work. Claims receive a
monotonic fence, base workspace generation and database-clock lease. Heartbeats
cannot revive an expired lease. Publication checks all three plus cancellation.
Idempotency keys are scoped to tenants and include operation inputs and engine
revision; conflicting reuse fails. Successful repeats return the existing job.

Queued cancellation is immediate. Running cancellation becomes
`cancel_requested`, causing the next heartbeat to stop the launcher; publication
also rejects it immediately. Once a stopped worker is acknowledged, the job is
`cancelled`. Ambiguous failures and expired leases become `needs_recovery` and
block further tenant mutations. Owner-authorized `discardRecovery` explicitly
keeps the last committed snapshot and discards pending effects; any subsequent
model attempt needs a new idempotency key. This provides idempotent committed
effects, **not exactly-once provider calls**. Durable model-response checkpoints
and resuming validated interrupted output remain future work.

## Snapshot and worker boundary

`SnapshotStore` is a private **local filesystem development adapter**. It captures
regular files into a new private directory, enforces size/file limits, rejects
links, credentials and unsafe paths, and addresses the sorted manifest by SHA-256.
Materialization always targets a fresh directory and verifies every file. Keep
the store outside all workspaces and inaccessible to workers/other users. Roots
and all their ancestors are operator-controlled, not upload destinations. Files
must be quiescent before capture. It is not a distributed object store, backup
system, or power-loss durability guarantee; production needs durable private
object storage with conditional immutable writes, encryption and retention.

`Supervisor.runOnce()` claims, clones a committed snapshot, runs a worker to
completion, captures and verifies the schema-2 receipt/artifacts, then atomically
commits the new workspace pointer, job result, artifact metadata and success
event. A crash before DB commit leaves the previous generation current. Uploaded
but unreferenced objects are safe to leave; garbage collection must later retain
all committed/recovery references and honor active-reader retention. Do not add
an uncoordinated filesystem cleanup cron. Failed disposable workspaces are removed;
uncertain container cleanup leaves a private quarantine for operator inspection.

`dockerRunner()` accepts only trusted server configuration: immutable local image
ID, expected engine revision, seccomp path, network and provider. It uses the
existing non-root, read-only, capability-free image with resource limits and one
workspace mount. It verifies the image's revision before starting, bounds worker
output/time, stops containers before success, and never inherits database/storage
credentials into them. Provider credentials use the Docker client environment,
not command-line values. Docker administrators can still inspect container env;
production needs scoped short-lived provider credentials or a restricted gateway.
Docker daemon access is privileged: run only in an isolated trusted supervisor.
Production network configuration must enforce provider-only egress externally;
the runner does not implement network policy. No published container ports.

For Linux development, pass a non-root host `uid:gid` so private workspace bind
mounts remain writable without relaxing filesystem permissions. The test-only
internal mock-model network shares one container namespace; it is not a production
network topology. The local worker image may be older than this control-plane
code because the JSON worker contract is unchanged; each queued job must match
the selected worker image revision.

## Verification

```
npm --prefix hosted/control-plane test
npm --prefix hosted/control-plane run test:postgres
```

The PostgreSQL check creates/removes an isolated local container and anonymous
volume, uses a random password, and publishes only an ephemeral loopback port.
It tests concurrent duplicate enqueue, membership denial, cross-tenant claims,
same-tenant serialization, cancellation, expiry/fencing, explicit discard, a real
database restart, real engine evaluation/publication, failed-workspace disposal
and generation conflicts. All candidate/model content is synthetic.

To also test two full evaluation/PDF workflows through real worker containers,
set `HOSTED_TEST_IMAGE_ID` to the previously built image's immutable `.Id` and
`HOSTED_TEST_SECCOMP` to the generated seccomp file. CI does this on Linux, verifies
both tenant generations reach 2, and retains the existing worker regression suite.
No real provider, cloud database or public deployment is used.

Still required before a hosted beta: real OAuth setup/verification, upload/fact
review and safe initial workspace provisioning, object-store adapter, process
service lifecycle/metrics, quotas/provider budget enforcement, recovery UI,
retention/deletion, real-model quality evaluation and adversarial security review.
