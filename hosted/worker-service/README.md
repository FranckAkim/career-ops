# Career Workspace background service

Separate Vercel project: `career-workspace-worker`, Root Directory
`hosted/worker-service`, Node 24, Next.js and Fluid compute. This is the trusted
controller; the candidate engine runs in a fresh Sandbox, outside this Function.
The frontend never bundles this service or receives its credentials.

The frontend commits its PostgreSQL job, then sends a short authenticated
notification to `/api/wake`. That route publishes a `career-jobs` queue message
and returns. The registered `/api/consume` queue consumer is private to Vercel's
queue infrastructure and runs the existing leased supervisor. Duplicate delivery
cannot claim the same job twice. Each completed claim wakes another drain.
Daily authenticated `/api/sweep` repairs missed notifications, reaps expired
leases and attempts to stop abandoned VMs using the private attempt journal.
An uncertain model execution still requires explicit recovery; no paid retry.
If a notification fails, queued jobs can wait until the next daily sweep or an
idempotent resubmission. Higher-frequency repair requires a suitable plan.

Runtime settings: restricted worker `DATABASE_URL`, private `BLOB_STORE_ID` with
OIDC project access, `HOSTED_ENGINE_IMAGES` JSON map of full engine revisions to
approved image digests, generated `HOSTED_DISPATCH_SECRET` and `CRON_SECRET`.
Set `HOSTED_WORKER_ENABLED=1` only after live checks and model access verification.
Separately set frontend `HOSTED_JOBS_ENABLED=1` when its worker is ready; production
API admission stays off by default even if Google credentials are added first.
The service uses `GEMINI_API_KEY` outside the VM and brokers its bearer header
through the exact chat-completions POST firewall rule. All other methods/paths
on that host are explicitly denied, as are all unrelated hosts. Model selection
is fixed to `gemini-3.5-flash-lite` at Google's OpenAI-compatible endpoint;
output is bounded by the existing engine. `HOSTED_MODEL_PROVIDER=gemini-free`
is the supported operator setting. Missing keys fail closed, with no AI Gateway,
paid model or Claude subscription fallback. Keep billing disabled on the Google
project; selecting this provider cannot itself verify or enforce Google billing.
See `docs/hosted/model-providers.md` for free-tier limits and the manual backup.

Beta limits: 10 enqueued jobs per workspace per rolling 24 hours, 20 journaled VM
attempts across the product per rolling 24 hours, one vCPU/240-second VM, queue
concurrency two and maximum five deliveries per notification. These are usage
limits, not a dollar budget or complete billing/retention system.

`scripts/prepare.mjs` copies only three reviewed SDK/transfer modules and adjusts
their package imports; edit their original source under `hosted/`. The build
audits route and dependency traces for credentials, candidate files and operator
migrations. Static storage tokens and DB-owner aliases must not be configured in
either deployment. Secrets belong in Vercel or ignored operator files.

Activation still requires real Google OAuth, real model access/quality checks,
live queue delivery/cancellation/expiry checks, Blob token incident cleanup and
retention/deletion controls. Do not describe a disabled worker as a usable beta.
