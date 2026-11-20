# Vercel worker adapter: transport foundation implemented

The hosted frontend now has its own deployment root. The next worker target is a
separate trusted supervisor invoking a fresh Vercel Sandbox for each claimed job.
Keep its SDK, operator credentials and lifecycle outside the frontend bundle.
The current Docker runner remains the runtime-verified reference implementation.
`hosted/workspace-transfer.mjs` now provides a dependency-free, bounded binary
bundle protocol with hash verification, fresh-directory import and confirmed
source retention checks. It rejects links, hard links, unsafe/colliding paths,
file/directory conflicts and excessive traversal. The default payload limit is
20 MB; callers must also bound raw SDK streams before JSON parsing. Export requires
a quiescent workspace and import requires an operator-owned parent directory.
It is not yet wired to a Sandbox runner. No Sandbox was created, registry pushed
or paid resource used. Live compatibility remains unproven.

## Preserve the existing execution contract

The supervisor claims a PostgreSQL job, clones its committed snapshot, maintains
the lease, invokes one allowlisted worker, validates output, uploads the immutable
snapshot and publishes through the existing fenced transaction. SDK failures do
not authorize a fresh paid attempt; ambiguous work still needs recovery. The
frontend request enqueues and returns, never keeps a supervisor alive afterward.

Map engine revisions to operator-approved immutable worker image digests. The
custom image must be prepared for Sandbox's linux/amd64 runtime. Sandbox ignores
image ENTRYPOINT/CMD, so launch the fixed worker command explicitly and check its
revision/UID before work. Verify Chromium sandbox, namespace/temp paths, browser
dependencies and non-root filesystem permissions live; never add a privileged,
root or no-browser-sandbox fallback to make the test pass.

Use fresh, non-persistent job VMs with no exposed ports or shared tenant drives.
Give each a bounded lifetime and resources. Import one verified workspace through
bounded file transfer, not database/Blob credentials inside the VM. Export only
the workspace through a trusted bounded manifest protocol that rejects links,
special files, traversal, unexpected primary-source changes and hash mismatches.
The existing JSON worker input/output stays the contract.

The current JavaScript SDK supports a Readable stdin, streamed stdout/stderr,
explicit cwd, command timeout and abort signal. Use those with fixed command/args,
bounded output and sanitized errors; check exitCode. Stop the VM in all outcomes,
and settle the runner only after stop is confirmed. Persist attempt/VM identifiers
privately for crash cleanup; failed cleanup requires quarantine/recovery. Review
pinned-session SDK APIs to avoid accidental auto-resume during cancellation/export.

## Provider access

Create the VM with restrictive egress from the start. Allow only the approved
provider domain and chat-completion POST path; block all other Internet and private
network access. Use the firewall's header transformation to broker the scoped
provider credential rather than putting it into the VM. Never pass through the
supervisor environment or Vercel/DB/Blob administration tokens.

The engine currently requires a non-empty provider key and sanitizes child envs.
A brokered adapter needs a non-secret placeholder plus explicit support for the
platform's per-sandbox TLS CA. The firewall terminates TLS for transformed hosts;
its documented CA/trust configuration must survive the worker's child-env filter.
Never disable TLS verification. Validate provider requests, blocked egress and
absence of secret credentials inside the VM with synthetic integration probes.

## Durable invocation and readiness

Select the supervisor's Vercel execution/trigger product using current official
documentation when implementing it; do not assume a request's returned response
keeps it alive. The PostgreSQL queue is already durable. Trigger redelivery must
not duplicate provider calls or bypass fencing/recovery. Reserve per-tenant usage
budgets before VM/model work and reconcile measured usage afterward.

Before activation: configure the project privately, verify image readiness and
model scope, run two synthetic tenants through the complete Sandbox/Blob/DB/PDF
path, interrupt/cancel/expire a worker, verify stop and stale-publication denial,
then measure actual resource/model cost under an authorized budget. Mock SDK tests
can establish adapter protocol only, never Sandbox/browser/egress compatibility.

Primary references checked for this plan:
[images](https://vercel.com/docs/sandbox/concepts/images),
[firewall and TLS](https://vercel.com/docs/sandbox/concepts/firewall),
[JavaScript SDK](https://vercel.com/docs/sandbox/sdk/javascript),
[credentials](https://vercel.com/docs/sandbox/concepts/credentials).
