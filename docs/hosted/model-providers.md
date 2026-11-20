# Gemini primary and personal Claude Code backup

The user selected Gemini's free API tier, with their Claude Code subscription
as a personal manual backup. The hosted service must not use shared subscription
credentials or silently switch to a paid API.

## Hosted primary

Worker Production settings: secret `GEMINI_API_KEY` and config
`HOSTED_MODEL_PROVIDER=gemini-free`. The server fixes the model to
`gemini-3.5-flash-lite` and the base URL to
`https://generativelanguage.googleapis.com/v1beta/openai`. This reuses the actual
engine's chat-completion evaluation/tailoring paths, without a new prompt engine.
The Sandbox broker injects the bearer outside the VM for the exact POST path;
the VM gets only a placeholder. All other egress stays denied.

Keep Google project billing disabled. The application cannot prove a key's
billing tier; the provider name is not a spending guarantee. Free quotas vary
by project/model and exhaustion must remain a failure requiring operator review,
not paid failover or unbounded retries. Existing publication fencing, strict
facts, source retention and PDF validation still apply.

Use synthetic CVs while validating. Google's free-tier terms permit product
improvement use of content; review suitability before processing private CVs.
Hosting, Sandbox, storage and database have separate quotas/costs.

## Personal manual backup

If Gemini is unavailable, leave the failed hosted job unchanged. The owner can
use a separate local career-ops workspace with their own Claude Code login:

1. Open that local workspace in Claude Code and read its agent/data contracts.
2. Supply their own reviewed CV/profile and the posting explicitly.
3. Ask Claude Code to run career-ops evaluation or tailoring, reviewing its
   proposed actions and results through the ordinary local workflow.
4. Keep outputs local. There is currently no supported import of local results
   into a hosted job, and a manual result must not mark the cloud job succeeded.

No subscription tokens are copied to Vercel or a shared VM. A future hosted
Claude Code option needs each end user to authenticate with their own supported
credentials and a separately reviewed integration; it is not implemented here.

Sources checked 2026-11-20: [Google compatibility](https://ai.google.dev/gemini-api/docs/openai),
[pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Claude Code product integration](https://code.claude.com/docs/en/legal-and-compliance).

## Live validation status

Real Gemini evaluation passed through the deployed private queue and isolated
engine. Tailoring has not passed: the latest synthetic generation reached the
CV fact checker and was rejected. No PDF was published. Worker and frontend
admission are disabled pending quality work and the separate Blob token cleanup.
The personal Claude Code backup remains manual; no shared subscription login
or automatic recovery/import exists.
