# Dedicated hosted deployment

This is the Vercel project root. Parent hosted instructions and PROJECT_HANDOFF.md
apply. Hosted UI and API implementations remain in `../../web/src/`; do not fork
their business logic here. `scripts/prepare.mjs` copies a fixed allowlist into
ignored generated paths before builds. Never edit generated copies.

This app is always hosted. Do not add local CLI, file dashboard, worker-launcher,
arbitrary URL/path or executable routes. Build verification must reject unexpected
routes, local user files and worker/legacy dependencies. Unknown source files or
links fail preparation; never recursively delete a source tree to repair it.

No public deployment, Vercel linking or paid provisioning is part of local build
verification. Use synthetic isolated DB/browser fixtures. Keep deployment/runtime
compatibility claims separate from actual live Vercel evidence.
