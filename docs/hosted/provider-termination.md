# Correlated Vercel timeout evidence

The operator-only `vercelTerminationVerifier` joins a signed admission receipt to a specific provider invocation. It handles positively recorded native function timeouts; it does not infer termination from request age, a configured duration, missing logs or a generic HTTP error.

## Evidence requirements

After successful database admission and before handler work, the frontend emits `CAREER_REQUEST_RESOURCE_ADMITTED` with a signed, opaque activity/project/deployment/instance identity. Admission and completion use separate HMAC domains. Their timestamps are informational. An admission receipt establishes no completion or termination authority by itself. The previous completion wire format is preserved by a fixed compatibility vector.

The verifier requires authenticated operator-owned log and invocation readers. It validates the receipt, takes the request ID from the provider log metadata, and joins that exact deployment/request to one invocation ID in `vercel.function_invocation.count`. The native provider metric must report `errorCode: timeout`, HTTP 504 and exact count 1. The query must use count aggregation and the five identity/outcome dimensions. The reader must explicitly confirm complete, project-scoped results. Duplicate, ambiguous, foreign, truncated, missing and unavailable evidence refuses verification. Console text containing a timeout code grants nothing. Ordinary 200/500/504 responses and generic invocation-failed errors do not qualify.

The resulting evidence digest binds the signed admission digest and exact provider project, activity, deployment, instance, request, invocation and outcome. `RequestReview` still requires the blocked account, current reviewed scope, explicit acknowledgement and `RESOLVE TERMINATED REQUEST`; it rechecks scope under database locks before writing the minimal opaque audit. One invocation's evidence cannot clear every marker in a shared runtime. Job/container/workspace, capture, failed-upload and shared-snapshot barriers remain independent requirements.

Vercel documents maximum-duration termination and the platform timeout error. See [function duration](https://vercel.com/docs/functions/configuring-functions/duration), [timeout errors](https://vercel.com/docs/errors/function_invocation_timeout) and [runtime logs](https://vercel.com/docs/logs/runtime). The external response error is `FUNCTION_INVOCATION_TIMEOUT`; the native metric code observed in the controlled proof was `timeout`.

## Operator readers

Read typed JSON log records through authenticated Vercel tools, scoped to the fixed project/deployment and searchable activity UUID. Use provider metadata fields (`projectId`, `deploymentId`, `requestId`, `source`, `isSystemLog`, `truncated`, `message`), not IDs parsed from application message text. Query the matching request with the native metric, grouping by deploymentId, requestId, invocationId, errorCode and httpStatus. Pass only complete results to the verifier.

The controlled proof used a ten-minute window available on the existing free plan. Older-window queries were rejected and no upgrade was purchased. Expired/unavailable evidence leaves a marker unresolved. No-receipt historical markers without signed admission, generic crashes, uncertain uploads and complete privileged/legacy execution coverage still require separate review. No public deletion endpoint or automatic sweeper is added.

## Isolated provider fixture

`hosted/control-plane/tests/provider-timeout-fixture.mjs` generates a four-file, Node-only fixture with a fresh case identity and a five-second limit. Deploy it manually to a separate fully protected preview with a new synthetic signing key. Never attach production DB, storage or OAuth credentials. Use the CLI's explicit `--environment preview` and verify the actual environment before invoking it; do not assume a connector's omitted target means preview. Invoke POST once, use the signed admission and authenticated native invocation record, and check the after-deadline marker. A harmless GET must not emit another admission.

The actual protected preview `dpl_CMbAk76gA4FxMhCaRsiopGDCWgxu` in isolated project `prj_XaNYx7xAdSiqJINsGwB7XdJH2nNK` returned a real platform 504. Its signed admission matched exactly one native timeout invocation and the verifier accepted that evidence. No after-deadline marker was observed, including after a harmless GET. No production request was resolved. The CLI-created temporary automation bypass was revoked and zero remaining bypasses verified; full project protection remains enabled. The project is retained as a private regression fixture without live credentials. Its initial unconfigured production artifact was not invoked and contained no signing key.

Local tests cover protocol compatibility, admission ordering, evidence context, ambiguity, unavailable readers and rejection of non-terminal outcomes. The complete PostgreSQL and hosted checks are recorded in `PROJECT_HANDOFF.md`. Production admission logging and final CI evidence are recorded there separately from this isolated timeout proof.
