# Code Engine package: `bedrock-broker`

Brokers all Amazon Bedrock traffic for the harness. The React app never holds AWS credentials — it calls this package via `domo.post('/domo/codeengine/v2/packages/<alias>', params)`, and the function reads AWS creds from a **mapped Domo Account** at runtime.

- **Language:** JavaScript (CE has no AWS SDK → SigV4 is hand-rolled in `sigv4.js`-style helpers inside `index.js`).
- **External HTTP:** `axios` (the only HTTP client available in CE JS).
- **Account:** an `Account`-typed input bound to the Bedrock account's data provider. Read via `codeengine.getAccount(input.id)`.
- **API (V1 / Spike S1):** uses the **OpenAI Chat-Completions** schema for all model families (`POST /v1/chat/completions`), routed by `modelConfig.endpoint` to `bedrock-runtime.{region}.amazonaws.com` or `bedrock-mantle.{region}.api.aws`. This replaced the earlier Converse path — **redeploy + re-smoke-test before relying on it.**

## Function: `runScenario`

### Inputs (configure these in the CE function editor)

| Input name | CE data type | Notes |
|---|---|---|
| `scenario` | Object (Open) | `{ id, instruction, input_context, task_type }` |
| `modelConfig` | Object (Open) | `{ bedrock_model_id, endpoint, path, intervention, params:{temperature,max_tokens}, fewshot_examples, rag_context, price_per_1k_input, price_per_1k_output }`. `endpoint` = `runtime` (Claude/Nova/Llama) \| `mantle` (DeepSeek/Qwen/Kimi/GLM/MiniMax). |
| `repeatIndex` | Number | N-repeats index (variance). |
| `dryRun` | Boolean | If true, estimate tokens/cost and skip the model call. |
| `bedrockAccount` | Account | Bound to the Bedrock account's data provider. |

### Output (Object)

```json
{
  "status": "ok",                 // "ok" | "error" | "throttled" | "dry_run"
  "run": {
    "scenario_id": "scn_0142",
    "repeat_index": 0,
    "output_text": "...",
    "resolved_prompt": "...",
    "model_id_resolved": "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "input_tokens": 812,
    "output_tokens": 240,
    "latency_ms": 1840,
    "cost_usd": 0.0021,
    "request_id": "a1b2c3d4-...",
    "timestamp": "2026-06-01T18:22:00Z"
  },
  "error": null
}
```

- On `dryRun: true` → `status: "dry_run"`, `run` carries estimated `input_tokens` and `cost_usd`, no model call.
- On Bedrock throttling (HTTP 429 / `ThrottlingException`) → `status: "throttled"` so the batch queue can back off and retry.
- On any other failure → `status: "error"` with a message in `error`.

## account.properties contract (TO CONFIRM — open item O1)

The CE `Account` input exposes `account.properties` whose keys depend on the provider type. The function reads creds defensively, trying common key names. **Confirm the actual keys** for the existing Bedrock account and pin them:

| Need | Likely property keys (any of) |
|---|---|
| Access key | `accessKey`, `accessKeyId`, `awsAccessKey`, `aws_access_key_id` |
| Secret key | `secretKey`, `secretAccessKey`, `awsSecretKey`, `aws_secret_access_key` |
| Session token (if STS) | `sessionToken`, `token`, `aws_session_token` |
| Region | `region`, `awsRegion` (else default `us-east-2`) |

## packagesMapping (manifest)

After the package is created and deployed, wire it into `app/manifest.json`:

```json
{
  "packagesMapping": [{
    "name": "bedrock-broker",
    "alias": "runScenario",
    "packageId": "<filled after create>",
    "version": "1.0.0",
    "functionName": "runScenario",
    "parameters": [ /* scenario, modelConfig, repeatIndex, dryRun, bedrockAccount */ ],
    "output": { "name": "result", "type": "object", "alias": "result" }
  }]
}
```

> **Release safety:** never "release" this package unless the user explicitly says "release".

## Deployed

- Package id: `1582c623-99a5-46f5-8641-f7159bc55071`, version `1.0.3` (on `domo.domo.com`) — **Converse-based; superseded by the V1 chat-completions rework in `index.js`.** Needs a new version deployed + re-smoke-test (Llama + DeepSeek via mantle + Sonnet inference profile).
- `runScenario` function + inputs/output are registered. **Not released.**
- ⚠️ `bedrockAccount` registered as **text** (create API limitation). Must be changed to **Account** in the CE editor before live calls work.
- Companion `scorer` package (`scoreRun`) is **not yet deployed** — see `codeengine/scorer/`. Fill `packageId` in `app/manifest.json` after deploy.

## Smoke-test runbook (CE editor)

1. **More → Workflows → Code Engine →** open **bedrock-broker**.
2. Confirm the `runScenario` source is present in the editor.
3. **Function Configuration → Inputs → `bedrockAccount` → Advanced Edit:** change type **Text → Account**, choose the data provider = your Bedrock account. **Save.**
4. **Start Function — dry run (no creds touched):**
   - `dryRun` = `true`, `repeatIndex` = `0`
   - `scenario` =
     ```json
     { "id": "scn_smoke_001", "task_type": "classification",
       "instruction": "Classify the sentiment as positive, negative, or neutral. Respond with one word.",
       "input_context": "The onboarding was rough but support fixed everything within a day. I'd recommend it." }
     ```
   - `modelConfig` =
     ```json
    { "bedrock_model_id": "us.anthropic.claude-3-5-sonnet-20241022-v2:0", "path": "runtime",
       "intervention": "zeroshot", "params": { "temperature": 0.2, "max_tokens": 64 },
       "price_per_1k_input": 0.003, "price_per_1k_output": 0.015 }
     ```
   - Expect `status: "dry_run"` with an estimated token/cost in `run`.
5. **Start Function — live:** set `dryRun` = `false`, select the Bedrock account, run.
   - Expect `status: "ok"` with `run.output_text` ≈ "Positive" and real token counts + `cost_usd`.
   - If you get a SigV4 / `SignatureDoesNotMatch` 403 → signing bug (fixable in `index.js`).
   - If you get a model lifecycle / end-of-life error → copy a currently granted Claude model or inference profile ID from the Bedrock console and replace `bedrock_model_id`.
   - If you get `inference profile`-required error → use the inference profile ID shown in Bedrock (often prefixed with `us.`).
   - If `account is missing access/secret key properties` → the property key names differ; report them so we can pin them in `extractCreds()`.
