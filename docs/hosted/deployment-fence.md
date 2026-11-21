# Public access fence for historical deployments

The frontend project now uses Vercel Standard Protection (`all_except_custom_domains`). The canonical production domain stays public; generated production and preview deployment URLs require Vercel authentication. The existing canonical hostname is a verified production project domain. The original career-workspace-two.vercel.app hostname redirects to it with status 308. The worker project is separate. This is a reversible project configuration change; no deployment is deleted. See [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).

## Read-only verification

`inspectDeploymentFence` accepts operator-owned authenticated project/inventory readers. It requires a complete, bounded inventory, validates fixed Vercel deployment hostnames, and sends anonymous probes with no credentials and no redirect following. It distinguishes a Vercel SSO redirect/authentication page from the application's own JSON 401. An application 401 alone cannot verify platform protection.

The inspector checks every generated deployment URL, current non-domain/branch aliases, the complete registered-domain inventory, production-domain redirects and the canonical app page/session endpoint. It requires the canonical hostname to be a verified production domain. Legacy protection enums are refused because the current branch address can remain public under them. It reads the inventory and protection policy again afterward; changed inventory/policy, configured bypasses, incomplete metadata, mismatched redirect targets, malformed hosts and unverified responses prevent verification. The report digest binds both observations and the probe results. The module exposes no public route, accepts no browser-selected URLs and performs no provider mutation or data deletion.

## Evidence and limits

Authenticated provider metadata for the initial 63 deployments reported Hobby, Fluid compute, a 300-second timeout, no custom function configuration and the linked GitHub repository. Referenced source commits used database-backed sessions with cookie caching disabled and routed hosted API methods through authentication. Historical CLI/redeploy labels do not themselves prove uploaded artifact identity; file-tree/content lookup did not provide that proof. These observations do not authorize deletion.

Vercel documents a provider-enforced maximum duration, including streamed work; see [function duration](https://vercel.com/docs/functions/configuring-functions/duration). The inspector reports configured bounds as metadata. It does not turn a duration, timestamp, READY status or successful access probe into execution-termination authority.

`publicFenceVerified` concerns ordinary anonymous public ingress. Reports always retain `executionCoverageVerified: false` and `privilegedAccessExcluded: true`. Vercel team members, privileged access paths, pre-existing executions, no-receipt crashes, uncertain uploads and older artifact provenance need separate evidence. Existing account/session, request/capture, worker, shared-snapshot and inventory barriers remain mandatory. No activity marker is cleared and no account is purged by this report. Public self-service deletion remains unavailable.

## Operator procedure

Read the actual project policy and complete deployment inventory using the authenticated connector or scoped CLI GET APIs. Retain only allowlisted metadata; never print environment values, bypass secrets or candidate data. Probe the fixed generated URLs and canonical production address. Check the entire result and repeat after deployments or protection changes. Keep deployment access protected; use authorized protected-deployment tooling when operator access is necessary. Do not loosen protection to run a diagnostic.

Unit tests cover correct platform/app classification, inventory/policy changes, bypasses, incomplete inventory, arbitrary hostname refusal, credential omission, mismatched redirects and sanitized provider errors. Live verification and CI evidence are recorded in `PROJECT_HANDOFF.md`.

## Production evidence - 2026-11-21

Source `f635331c07c080b672e7760fa63697a06923f52b` passed Windows/Linux [CI 44928702738](https://github.com/FranckAkim/career-ops/actions/runs/44928702738). Deployment `dpl_FUtP2kwoYuRhqd4g43EnSiqnodjK` is READY. The post-deployment diagnostic verified 65 generated URLs requiring Vercel authentication, one protected branch alias, one registered-domain 308 redirect and the public canonical page/session endpoint. Policy, domain and inventory observations were stable across the probes. Provider metadata reported 300 seconds; executionCoverageVerified remains false.

A separate fresh file-free synthetic account completed two authenticated canonical requests after modern protection; temporary auth/activity records were removed. No deployment was deleted, no active marker resolved and no real account or Blob touched. Worker settings were unchanged. Aggregate audit observed zero active/unknown request markers, zero review receipts and zero blocked live accounts; local worker remained running and queue idle. Counts are snapshots and require renewed verification after deployment or policy/domain changes.
