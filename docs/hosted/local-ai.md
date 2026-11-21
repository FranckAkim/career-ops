# Operator-owned local AI worker

The user selected local AI on 2026-11-20. This supersedes the unpaid Gemini plan for real profiles. The web application, Google identity, Neon queue and private Blob remain hosted. One trusted operator computer processes queued jobs; visitors do not install a model. The computer must stay on. This is an owner preview, not an uptime guarantee.

## Boundaries

- Official Ollama v0.40.16 image pinned to `ollama/ollama@sha256:910d0d8107b538fb0894e63163eb195de0cc7aefcbc666dc62d3b18f71124592`, `OLLAMA_NO_CLOUD=1`, model `qwen3.5:4b`, context 65536, one parallel request.
- Model container `career-workspace-local-ai` runs on an internal Docker network with no published ports. Download the model before disconnecting external networking. The model volume persists across container replacement.
- Each non-root engine container shares only the model network namespace, mounts one tenant workspace, and retains resource limits, seccomp, dropped capabilities and read-only engine files. External inference is unreachable.
- The supervisor alone holds the restricted `career_worker` Neon role and short-lived Vercel storage OIDC identity. These never enter the inference containers. No cloud AI fallback exists in local mode.
- Existing queue leases, fencing, recovery, canonical writes, fact checks and strict PDF validation remain mandatory. Failed jobs require review; no implicit model retries.

## Operator configuration

Install dependencies with `npm ci --prefix hosted/local-worker --ignore-scripts`. Generate seccomp with `node hosted/prepare-seccomp.mjs <absolute-private-path>` and build only a committed image through `hosted/image-context.mjs`. Inspect the image revision and non-root user before configuration.

Keep configuration and runtime credentials outside Git. `run.mjs --config <absolute-config-path>` reads JSON with: immutable local Docker `image` ID; full `engineRevision`; absolute `seccomp`, `workRoot`, `credentialFile`, installed Vercel CLI JS `vercelCli`, linked worker-service `projectRoot`; `project=career-workspace-worker`; exact `projectId`; and team slug. The credential filename must start `.env` within the private work root. Other model endpoints/model names in the input are ignored in favor of the fixed local configuration.

The CLI session must have access to that linked project. The worker pulls Development runtime credentials using native Vercel CLI arguments, keeps only the restricted database URL, Blob store ID and short-lived OIDC token, and refreshes before expiry. Do not print these files or commit them. A database/store change requires a restart. Only one supervisor may hold the state-directory lock.

Run a bounded probe with `node hosted/local-worker/run.mjs --config <absolute-config-path> --once`; omit `--once` for polling. Stop with SIGINT/SIGTERM or the exact operator-owned process PID. Windows background launches must use `Start-Process -WindowStyle Hidden`, with logs and PID under the private work root. No system startup task is installed automatically.

## Hosted activation

Frontend Production: `HOSTED_EXECUTION_MODE=local`, `HOSTED_LOCAL_WORKER_CONFIGURED=1`, and finally `HOSTED_JOBS_ENABLED=1` only after real local evaluation/tailoring tests pass and old exposed storage credentials are revoked. Local mode never calls the cloud worker wake endpoint. The worker project remains `HOSTED_WORKER_ENABLED=0`. Previews retain Vercel protection.

Profiles and results still reside in hosted storage and are downloaded onto the operator computer during processing. `/hosted/privacy` explains this. Retention limits and self-service deletion are not implemented; do not describe local inference as all data staying on the visitor's device.

## Verification status

GPU/network health passed on an RTX 3070 Laptop GPU. The initial real synthetic evaluation failed at 32768 context; at 65536 it exceeded the previous 90-second request budget. The engine now gives loopback requests 300 seconds, within the supervisor's 600-second deadline, and disables optional thinking specifically for loopback Qwen 3.5. Complete live two-tenant evaluation/PDF verification is still required before activation.
