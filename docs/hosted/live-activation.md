# Live activation: account actions and remaining checks

The deployed entry is https://career-workspace-franck-the-tank.vercel.app .
The separate controller is `career-workspace-worker`. Both use the user fork's
`product/hosted-foundation` branch. Production entry points are public by explicit
user approval; previews retain Vercel protection. Application credentials and
the private queue consumer remain enforced. This is not an activated beta.

## Account-holder actions

1. Initial Google sign-in is verified in the deployed app. Google OAuth is now
   configured in project `career-workspace-515317` (Career Workspace), with an
   External/Testing Web client and the approved initial test user. Sensitive
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured in frontend
   Production and the redeployment is READY. Authorized origin:
   `https://career-workspace-franck-the-tank.vercel.app`. Redirect URI:
   `https://career-workspace-franck-the-tank.vercel.app/api/auth/callback/google`.
   Anonymous session returns 401, and sign-in initiation returns 200 with the
   exact callback and email/profile/openid scopes. User-completed Google login
   reached authenticated CV onboarding and remained authenticated after reload.
   Live logout/revocation has not yet been exercised.
   Keep credentials and contact details outside source/chat. Keep preview origins
   separate; do not wildcard trusted origins. Testing restricts access to test users.
2. Verify Gemini free-tier access and real-model output quality. The user replaced
   AI Gateway with direct Gemini; card verification is no longer the chosen path.
   Worker Production has `GEMINI_API_KEY` (secret) and `HOSTED_MODEL_PROVIDER`.
   Keep the Google project on the free tier without enabling billing. Follow
   `model-providers.md`; Claude Code subscription is a personal manual backup,
   not an automatic shared hosted provider. Live model quality remains unproven.
3. Revoke/regenerate the old read/write token for `career-workspace-private` in
   Vercel Storage. It was included in the rejected private image caught before
   Sandbox execution. The image records/local tag were removed; DB owner/runtime
   passwords and the app auth secret were rotated. Both deployments now use Blob
   OIDC, and the static token env variable was removed. Removing an env variable
   alone does not revoke its old credential. No candidate data was present and
   no unauthorized access is known. A short-lived development OIDC token was
   also in that rejected image; do not claim it was individually revoked.

## Operator continuation after those actions

Keep frontend `HOSTED_JOBS_ENABLED` unset/0 until the worker is verified.
Google settings are deployed, anonymous session returns 401, and real Google
login/session persistence is verified. Complete logout/revocation checks and
verify all production entry aliases use the exact OAuth origin.

Enable worker `HOSTED_WORKER_ENABLED=1` for a controlled smoke check while
frontend job admission remains off. Verify its authenticated `/api/wake` publishes
to the private queue consumer. Local development tokens cannot publish messages
pinned to production deployments; an explicit probe was denied before publication.
Use the real deployed producer rather than bypassing that environment boundary.

Run the two-tenant evaluation/tailoring/PDF flow with real model responses under
an agreed small budget. Review source fidelity, omissions and output quality.
Exercise active cancellation, expiry/stale publication and restart cleanup.
If the model fails strict validation, fix/review the output path; do not relax
fact, browser-sandbox, source-retention or receipt checks to obtain success.

Only after these checks enable frontend `HOSTED_JOBS_ENABLED=1` and redeploy.
Verify the real browser -> queue -> Sandbox -> Blob -> report/PDF download flow
and tenant denial. Retention/deletion, confirmed-profile editing, billing and
broader scan/autofill workflows remain separate product work before a broad beta.

## Already verified

Reviewed schemas 001–004, restricted runtime roles without schema CREATE and
verified database TLS; private Blob binary round trip; four real cloud jobs for
two synthetic tenants reaching generation 2 with one-page PDFs; fresh non-root
VMs, Chromium sandbox, system CA trust, blocked unrelated egress, confirmed stop,
and creation-time cancellation preserving the committed snapshot. Model replies
for that flow were fixed proxy fixtures. Full local/Postgres/browser/Docker tests
and cross-platform CI establish additional contracts; they do not prove real
model quality or Google OAuth. All VMs from these checks were stopped.
