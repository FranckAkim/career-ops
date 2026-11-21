# Live activation

The hosted entry is https://career-workspace-franck-the-tank.vercel.app . Source is the user fork's `product/hosted-foundation` branch. Production entry points are public by explicit approval; previews retain Vercel protection. Google OAuth remains External/Testing with the approved initial test user.

## Current execution mode

The user selected local AI. See `local-ai.md`. Vercel serves the web application, Neon owns the durable queue, private Blob holds snapshots and results, and the operator's computer runs isolated Qwen inference. Cloud worker execution remains disabled. Claude Code subscription access remains a separate personal manual backup; no subscription credential is shared with the hosted service.

Production engine revision is being moved to `73e7202deeccce325e5f3b337d9840987ddfc9dd`. Its image is built from committed allowlisted source and pinned by local Docker image ID. The Windows task `CareerWorkspaceLocalWorker` runs the supervisor without a visible terminal, while the operator is signed in. It has no automatic sign-in trigger. The computer and Docker must remain on for jobs to finish.

## Verified

- The old static Blob credential is rejected. Fresh same-project OIDC storage access and production HTTP downloads still work after revocation. Do not restore the old credential or delete the store.
- Google login/reload worked for the real user. Synthetic session tests prove owner PDF downloads with matching hashes and private/no-store headers, other-tenant 404, anonymous 401 and revoked-session 401. Temporary test auth records are removed after checks.
- Real local Qwen evaluation and schema-enforced tailoring passed for two synthetic tenants at engine `1a19a63`. Both produced distinct one-page PDFs under strict facts, locked sections, chronology, source retention and page validation; production HTTP downloads passed.
- Windows/Linux CI run 44851731816 passed at that engine. A later production browser test created a reviewed profile and queued a real local evaluation, but the model returned `Unknown` for an explicitly named placeholder employer. The engine correctly refused publication and retained the committed workspace.
- Engine `73e7202` clarifies employer extraction in the response schema and final user instruction. Repeating the same failed profile/posting in isolation returned `Example Employer`, `Software Engineer` and a valid score. The UI now explains this recovery category.

## Pending final browser test

Production admission is paused (`HOSTED_JOBS_ENABLED=0`). The corrected browser test will explicitly discard only the synthetic interrupted output, enqueue evaluation and tailoring through the real interface, verify the PDF hash, reload, mobile layout, cancellation and session revocation. Leave admission enabled only after this passes; otherwise pause it again.

Automatic approval review requires explicit user approval for this controlled production activation. It also rejected exporting the live restricted database URL to an unconfigured, protected `validation/local-ai` preview without destination-specific approval. No database/auth credentials were uploaded to that preview. Do not work around either rejection.

## Product limits

This remains an owner preview. Retention limits, self-service deletion, confirmed-profile editing, billing and broader scan/autofill workflows remain separate work before a broad beta. Hosted data still resides in Neon/Blob and is downloaded to the operator computer during processing; local inference does not mean data remains on each visitor's device. The app's `/hosted/privacy` notice states this.
