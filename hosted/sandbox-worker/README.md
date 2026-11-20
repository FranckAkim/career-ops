# Isolated Vercel worker adapter

This package is separate from the frontend and pins `@vercel/sandbox` 4.0.0.
`runner.mjs` implements the supervisor runner contract using fresh non-persistent
VMs, immutable revision-to-image mappings, a pinned session, fixed worker commands,
bounded command output, validated workspace transfer and confirmed VM stop before
local publication. Model authorization is injected by an exact-host/path/POST
firewall rule; no provider, database or Blob credential enters the VM environment.
The fixed system CA bundle survives the engine's child environment filter.

Supply an operator-approved image map, provider settings and `attemptJournal(queue)`.
Migration 004 records a random Sandbox name before creation and its session ID
after creation. A duplicate attempt for the same job/fence fails; uncertain work
must never automatically retry model execution. An interrupted supervisor leaves
a journal entry for cleanup. Stop failure keeps the workspace quarantined.

The worker image contains `hosted/transfer-worker.mjs` and the engine, not this SDK
package. Sandbox ignores the Docker entrypoint. The runner explicitly probes its
revision and non-root UID before importing the workspace and starting the worker.

`npm ci --ignore-scripts && npm test` verifies the SDK protocol with synthetic
handles. These tests do not prove custom-image boot, egress, TLS, Chromium or cloud
lifecycle compatibility. Live checks and durable deployment/trigger integration
remain required before serving users. Keep model and resource usage bounded.
