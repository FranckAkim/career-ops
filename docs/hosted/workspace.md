# Job workspace and protected artifacts

After profile confirmation, `/hosted` now shows the user's personal job workspace.
The UI accepts pasted posting text plus an optional reference URL, submits an
evaluation, polls durable progress, shows job history and the original report,
requests a tailored CV, and downloads reports/PDFs. It does not fetch the URL,
start a model inside an HTTP handler, submit applications or automatically retry
model work. Nothing is deployed; Vercel remains the target.

## UI behavior

- The newest 100 jobs are listed, and the most recent is restored after reload.
  Selecting a job reads its status/result and ordered event pages. Event sequence
  IDs remain strings; bounded pages are drained before polling stops on terminal
  jobs. Reads poll every 1.5 seconds while active and abort on selection/unmount.
- Human-triggered enqueue actions use idempotency keys. Evaluation retries keep
  the key while the input is unchanged; CV requests reuse a key per evaluation
  during the mounted session. There is no automatic mutation/model retry. A
  reload does not preserve an ambiguous submission key: inspect history before
  deliberately submitting again. Backend idempotency remains authoritative.
- Cancellation is available for queued/running work. Recovery requires an
  explicit checked acknowledgment before owner-authorized discard. The last
  committed workspace remains intact; no ambiguous output is auto-published.
- Reports are shown as escaped, read-only original text. Raw HTML/scripts are
  never rendered. This deliberately preserves canonical output rather than
  introducing a second scoring/parser implementation. Historical report metadata
  may say PDF pending; later tailoring status/downloads are shown separately.
- Desktop/mobile layouts were visually checked. Profile onboarding is retained;
  the legacy local dashboard/filesystem/process APIs remain blocked in hosted mode.

## Artifact delivery

`GET /api/hosted/tenants/{tenant}/artifacts/{job}/{kind}` accepts only `report`
and `pdf`. The session supplies the actor. Membership is checked in PostgreSQL,
then a succeeded job is joined to its **own committed workspace version** and
artifact hash. The path must match the server-owned result field. A client cannot
choose a filesystem path, blob URL, snapshot ID, executable or HTML artifact.

Migration 003 adds a unique tenant/job index for committed workspace lookups and
preserves prior migration checksums. A later workspace generation does not change
an older job's download. Failed/queued/recovery jobs and unpublished orphan files
are unavailable through this route.

Both snapshot adapters now expose `readBytes()`, preserving binary bytes and
enforcing a caller-specified size cap before reading a file. `read()` continues to
decode UTF-8 for receipts/source text. Artifact delivery verifies snapshot content
and the database artifact hash; PDFs also require the PDF signature. Reports are
capped at 2MB and PDFs at 20MB. Corrupt/unavailable storage fails closed.

Downloads use fixed server-generated filenames, correct MIME types, attachment
disposition, private/no-store caching, Cookie variance, nosniff, no-referrer and a
restrictive document CSP. No public blob URL or signed download URL is returned.
Responses buffer only the bounded artifact; range/resumable downloads are not
implemented. Access revocation is checked per new request, not after bytes have
already been authorized and sent. Do not garbage-collect old committed versions
without a coordinated retention/deletion policy.

## Evidence

Real PostgreSQL tests publish synthetic fixture metadata to verify tenant denial,
kind allowlists, queued-job rejection, exact binary delivery, immutable-generation
binding after a later publication, hash checks and corruption rejection. These
are explicitly authorization/publication tests, not rendering evidence.

The full production-Next browser integration separately:

1. Confirms a reviewed synthetic profile through the UI.
2. Submits a posting from the job form into PostgreSQL.
3. Runs the queued evaluation in the existing constrained worker container.
4. Reads the committed report through its protected route.
5. Requests tailoring from the UI and runs the real HTML/strict-fact/PDF pipeline.
6. Downloads the real rendered PDF in the browser and compares its SHA-256 with
   the worker's committed result, then verifies reload/mobile layout.
7. Exercises queued cancellation and expired-job recovery/explicit discard.
8. Verifies a second user's download gets 404 and an anonymous download gets 401.

The test driver invokes trusted supervisors out of band; no worker/admin endpoint
or test-login bypass exists in the application. All model replies are synthetic
on an internal network. Google OAuth, live Blob/OIDC, real-model quality and
production Vercel worker compatibility are not established by these tests.

## Next deployment work

Prepare a hosted-only build so blocked legacy local routes/code do not inflate
the deployment or trigger broad-filesystem tracing. Prove a Vercel-compatible
isolated worker adapter with durable invocation, fencing, storage transfer and
provider-only egress; the current Docker launcher is a local/reference adapter.
Add admission budgets/quotas and retention/deletion before enabling a hosted beta.
Then configure and verify private Blob/OIDC, PostgreSQL roles/TLS/pooling, live
Google OAuth and authorized model credentials/budget. No paid resources were
provisioned or public deployment attempted for this milestone.
