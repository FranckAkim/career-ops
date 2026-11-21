# Reviewed profile editing

My Profile supports editing the confirmed name, target role, output language and source CV. Changes first produce a review screen containing normalized source text. Saving requires an explicit confirmation checkbox and a matching review hash. No model extracts or confirms career facts during this operation.

The owner-authorized profile service publishes a new immutable workspace generation. Storage verification happens before the short database transaction. The transaction locks the same tenant row used by queue admission, claiming and worker publication, then rechecks the source hash, generation, active jobs, queued jobs and recovery state. A stale editor, storage failure or newly queued job cannot replace the saved workspace. Exact concurrent retries publish only once.

Source publication changes the submitted CV, name/language settings, hosted target-role line and confirmation provenance. It preserves unrelated profile settings, appended user targeting notes, fact configuration, canonical tracker, reports and PDFs. Unrecognized external source customizations fail for review rather than being overwritten. Source-only generations have no job receipt; application projections resolve the most recent committed job at or before the current generation. Existing artifact downloads stay bound to their original job snapshot.

CV preparation from an evaluation created before the latest profile confirmation is rejected at queue admission with a 409 `evaluation_stale`. The existing engine independently compares source context hashes before tailoring. A fresh evaluation is required after source changes. Previously generated reports and PDFs remain available as historical artifacts; the editor states this before confirmation.

## Rollout and verification

- Feature gate: `HOSTED_PROFILE_EDITING_ENABLED=1` in frontend Production. An unset gate retains the confirmed-profile read view and blocks all new profile API routes.
- No schema migration, new database grants, engine image change, paid provider or local-worker restart is required.
- API route publication duration is bounded to 300 seconds for private snapshot storage I/O; no model work executes in the request.
- Control-plane unit tests: nine pass. Root frontend type checks, hosted build and source/dependency boundary checks pass.
- Disposable PostgreSQL tests pass for reviewed versions, concurrent replay, stale editors, stale engine/admission checks, storage failure, a job queued during capture, tracker preservation, owner denial, preservation of extra settings/notes and no additional model calls.
- Full isolated container/browser checks pass for review/checkbox confirmation, version increments, reload and unchanged application stages, alongside the existing two-tenant PDF, navigation, cancellation and recovery checks.
- Final frontend source: `f535d3f258026eb09b75bf5d22a18902734e1c1d`. Vercel deployment `dpl_CviDNiLgodRNYQ6fyDAbH62EYMAJ` is READY. Live synthetic browser checks pass for reviewed publication, version increment, reload/mobile width, unchanged tracker and prior PDF hash, stale-profile/CV rejection, tenant 404, anonymous 401 and revoked-session 401. A separate read-back verified private Blob CV/configuration/targeting/provenance against the committed profile version. Temporary synthetic auth records were removed; no model call or real user session was used. CI results are recorded in the shared handoff.

Retention/account deletion and broader Google beta access remain separate work. Profile history is retained during this preview; saving a new version does not erase old source snapshots or documents.
