---
shaping: true
---

# Spike S1 — Bedrock open-weight (mantle) adapter

Resolves the flagged unknown on **B2 / D4** → unblocks **R8** (dual-path adapter).

## Context

The build plan assumed two divergent Bedrock paths — `Converse` (Claude/Nova/Llama) and a separate `mantle`/chat-completions path (DeepSeek/Qwen/Kimi) — implying the CodeEngine broker needs two different adapters. The current broker (`codeengine/bedrock-broker/index.js`) only implements the Converse path, hand-signing SigV4 against `bedrock-runtime.{region}.amazonaws.com/model/{id}/converse`.

## Goal

Describe concretely how to reach the open-weight models from CodeEngine, and whether one adapter or two is actually required.

## Questions & answers

| # | Question | Finding |
|---|----------|---------|
| **S1-Q1** | What's the endpoint/contract for open-weight models? | OpenAI-compatible **Chat Completions**. Recommended host: `https://bedrock-mantle.{region}.api.aws/v1/chat/completions`. Body/response use the OpenAI schema (`messages[]`, `choices[].message.content`, `usage.prompt_tokens`/`completion_tokens`). |
| **S1-Q2** | How is it authenticated from CodeEngine (no AWS SDK)? | Two options: a **Bedrock API key** (Bearer token) **or AWS credentials via SigV4**. The broker already hand-signs SigV4 with `crypto`; the same signer works against the mantle host (service name `bedrock`). So no new auth mechanism is needed. |
| **S1-Q3** | Do we really need a second adapter? | **No — likely one.** Chat Completions runs on **both** endpoints: `bedrock-mantle.{region}.api.aws/v1/chat/completions` *and* `bedrock-runtime.{region}.amazonaws.com/v1/chat/completions`. The runtime endpoint accepts SigV4. So Claude/Nova/Llama **and** DeepSeek/Qwen/Kimi can be driven through **one OpenAI-style schema on one signing path**, instead of Converse-for-some + chat-for-others. |
| **S1-Q4** | What changes in the existing broker? | Minimal: swap path `/model/{id}/converse` → `/v1/chat/completions`; move the model id into the body (`"model": "<id>"`); build OpenAI `messages` instead of Converse `content[].text`; parse `choices[0].message.content` + `usage.prompt_tokens/completion_tokens`. SigV4 signer, account/cred extraction, throttle handling, cost calc all stay. |
| **S1-Q5** | Caveats / what still varies per model? | (a) **Region availability** — us-east-2 (D2) may lag us-east-1/us-west-2 for the newest open-weight models; per-model endpoint/region must be verified when populating the registry (open item **O4**), but that's a *config* task, not a mechanism unknown. (b) **Claude needs an inference profile id** (e.g. `us.anthropic.claude-sonnet-4-6`) as the `model` value (decisions-log). (c) AWS recommends the **mantle** host for open-weight models, so keep a per-registry-entry `endpoint` field to allow `mantle` vs `runtime` even though both can speak chat-completions. |

## Resolution

**The adapter is understood.** Recommended design:

- **One normalized contract**, one OpenAI Chat-Completions request/response shape (which also matches the `frontier-inference-architecture` reference client — directly reusable).
- **One SigV4 signer**, parameterized by host: `bedrock-runtime.{region}.amazonaws.com` (Claude/Nova/Llama, also fine for some open-weight) vs `bedrock-mantle.{region}.api.aws` (preferred for open-weight). Registry entry carries `endpoint: "runtime" | "mantle"` + `model_id` + pricing.
- Keep Converse only if a specific feature needs it (e.g. native tool-use blocks); otherwise chat-completions is the common denominator and simplifies B2 to a single code path.

This flips **B2/D4 flag → resolved** and **R8 → ✅ for Shape B**. Remaining work is registry population + in-region availability verification (O4), not adapter design.

### Open follow-ups (config, not mechanism)
- ✅ **O4 resolved:** DeepSeek V3.2, Qwen3, Kimi K2.5, GLM 4.7, and MiniMax M2.1 are all confirmed present in the **us-east-2** model catalog — no second region needed.
- Confirm whether the existing Bedrock Domo Account creds (O1) carry the IAM permissions for the mantle endpoint / Projects API, or whether a Bedrock API key is preferable for that path.
