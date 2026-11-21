# Model providers

## Selected primary: local Ollama

The user selected local AI for real profiles. The hosted application uses an operator-owned worker running `qwen3.5:4b` with Ollama; see [local-ai.md](local-ai.md). Evaluation and CV payloads use schema-constrained model responses with independent validation. Existing career-ops code still owns scoring instructions, report persistence, tracker writes, HTML rendering, fact checks and PDF publication.

Inference containers share an internal model network with no published ports or external egress. `OLLAMA_NO_CLOUD=1` is required. The supervisor alone holds restricted Neon and short-lived Blob OIDC credentials. There is no automatic cloud fallback or shared coding-subscription login. Hosted storage remains on Vercel/Neon, and temporary job data is downloaded to the operator computer; this is not inference on each visitor's own device.

The computer must be on, signed in and running Docker for processing. Jobs wait while it is offline. AI output can fail validation; review failed jobs and discard interrupted output explicitly rather than retrying indefinitely or relaxing factual checks. Human review and application submission remain mandatory.

## Personal manual Claude Code backup

The owner can use a separate local career-ops workspace with their own Claude Code subscription:

1. Read that workspace's agent instructions and data contract.
2. Supply their own reviewed profile and posting.
3. Run evaluation or tailoring through the ordinary local workflow and review the result.
4. Keep outputs local. There is no supported import into hosted jobs; a manual result must not mark a hosted job succeeded.

No subscription credentials are copied to Vercel or shared with hosted users.

## Historical Gemini experiment

The disabled cloud worker contains a direct Gemini compatibility adapter. Real evaluation and schema-enforced tailoring passed for two synthetic tenants at engine `df3412019f725ac66d6504e99c205ed71d5696c1`, including distinct one-page PDFs and private downloads. This demonstrated pipeline behavior only.

Google's unpaid API terms prohibit sensitive, confidential or personal information. Never send real CVs to that historical free-tier configuration. Keep cloud execution disabled; any future cloud provider needs a separately reviewed configuration and explicit spending authorization. Hosting, storage and database quotas are separate from local inference.

Sources: [Ollama local-only mode](https://docs.ollama.com/faq), [OpenAI-compatible local API](https://docs.ollama.com/api/openai-compatibility), [Google API terms](https://ai.google.dev/gemini-api/terms), [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance).
