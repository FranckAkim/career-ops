# Live activation

The hosted entry is https://career-workspace-franck-the-tank.vercel.app . Source is the user fork's `product/hosted-foundation` branch. The canonical frontend production domain is public by explicit approval. Frontend modern Standard Protection (all_except_custom_domains) gates generated deployment and branch URLs; see deployment-fence.md. The worker retains its separately approved secret-protected public endpoints. Google OAuth remains External/Testing with the approved initial test user.

## Production URL protection

The frontend uses modern Standard Protection with `ssoProtection.deploymentType = all_except_custom_domains`. Its canonical hostname is a verified production project domain. The original `career-workspace-two.vercel.app` hostname redirects to it with 308. Generated deployment and branch URLs require Vercel authentication; the canonical app stays public with Google sign-in for user data. Do not reset the frontend to `preview` or legacy `prod_deployment_urls_and_all_previews`. Worker protection is configured separately. Read `deployment-fence.md` for verification and execution-drain limits.

## Current execution mode

The user selected local AI. See `local-ai.md`. Vercel serves the web application, Neon owns the durable queue, private Blob holds snapshots and results, and the operator's computer runs isolated Qwen inference. Cloud worker execution remains disabled. Claude Code subscription access remains a separate personal manual backup; no subscription credential is shared with the hosted service.

Production engine revision is pinned to `1b2d1b72da7b5665d33da7ec1f71e4bd7ba9a4a6`, with the reviewed `73e7202` compatibility mapping retained. PROJECT_HANDOFF.md records the latest verification; the activation examples below are historical evidence. Its image is built from committed allowlisted source and pinned by local Docker image ID. The Windows task `CareerWorkspaceLocalWorker` runs the supervisor without a visible terminal, while the operator is signed in. It has no automatic sign-in trigger. The computer and Docker must remain on for jobs to finish.

## Verified

- The old static Blob credential is rejected. Fresh same-project OIDC storage access and production HTTP downloads still work after revocation. Do not restore the old credential or delete the store.
- Google login/reload worked for the real user. Synthetic session tests prove owner PDF downloads with matching hashes and private/no-store headers, other-tenant 404, anonymous 401 and revoked-session 401. Temporary test auth records are removed after checks.
- Real local Qwen evaluation and schema-enforced tailoring passed for two synthetic tenants at engine `1a19a63`. Both produced distinct one-page PDFs under strict facts, locked sections, chronology, source retention and page validation; production HTTP downloads passed.
- Windows/Linux CI run 44851731816 passed at that engine. A later production browser test created a reviewed profile and queued a real local evaluation, but the model returned `Unknown` for an explicitly named placeholder employer. The engine correctly refused publication and retained the committed workspace.
- Engine `73e7202` clarifies employer extraction in the response schema and final user instruction. Repeating the same failed profile/posting in isolation returned `Example Employer`, `Software Engineer` and a valid score. The UI now explains this recovery category.

## Historical owner-preview activation

The user explicitly approved the controlled production test and leaving jobs enabled only on success. It PASSED at engine `73e7202deeccce325e5f3b337d9840987ddfc9dd`; Windows/Linux CI run 44853134551 is green. Deployment `dpl_2hm9p8nNNgqFX4EZMTpeGHX4au4V` reached READY.

The real production browser explicitly discarded only interrupted synthetic output and retained the confirmed profile. A new evaluation completed through the actual hosted queue and background local worker. Tailoring produced a strict one-page PDF; the downloaded bytes matched the committed hash. Reload, mobile layout without horizontal overflow, cancellation and revoked-session denial all passed. Temporary synthetic authentication was removed; real user sessions were not changed. Desktop/mobile proof screenshots and a restart guide are saved in the operator's task outputs.

Production has `HOSTED_EXECUTION_MODE=local`, `HOSTED_LOCAL_WORKER_CONFIGURED=1`, `HOSTED_JOBS_ENABLED=1`, and the then-pinned engine revision above. Cloud worker remains `HOSTED_WORKER_ENABLED=0`; authenticated cloud wake returns 503. The old static Blob token was checked again and rejected; fresh OIDC access and private production HTTP download/tenant denial checks still pass.

An unconfigured protected `validation/local-ai` preview was created during testing. Automatic review rejected exporting live credentials to it; no database/auth secrets were uploaded and no protection settings changed. It is not the active app.

## Product limits

This remains an owner preview. Retention limits, self-service deletion, confirmed-profile editing, billing and broader scan/autofill workflows remain separate work before a broad beta. Hosted data still resides in Neon/Blob and is downloaded to the operator computer during processing; local inference does not mean data remains on each visitor's device. The app's `/hosted/privacy` notice states this.
