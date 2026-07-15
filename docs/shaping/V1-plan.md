---
shaping: true
---

# V1 Plan — Persisted, real-scored playground

Implementation plan for slice **V1** in [`slices.md`](./slices.md). Goal: kill the synthetic demo data — a run is a real Bedrock call, scored by a real scorer, persisted to AppDB, reproducible from a hashable RunConfig.

## Scope (parts: B1, B2/S1, B4 core, B9, N9)

| # | Deliverable | Place | File(s) |
|---|---|---|---|
| 1 | OpenAI Chat-Completions broker (replaces Converse), host per `endpoint` | CE | `codeengine/bedrock-broker/index.js` |
| 2 | `scoreRun` eval function (real scorers) | CE | `codeengine/scorer/index.js` |
| 3 | RunConfig contract + `config_hash` | App | `app/src/lib/runConfig.ts` |
| 4 | Type reconciliation w/ AppDB schema | App | `app/src/types/harness.ts` |
| 5 | AppDB repositories (typed CRUD) | App | `app/src/lib/repos.ts`, `app/src/lib/domo.ts` |
| 6 | 8-model registry + scenario seed + bootstrap (load-or-seed) | App | `app/src/data/seed.ts`, `app/src/lib/bootstrap.ts` |
| 7 | Playground: persist runs/evals, RunConfig preview | App | `app/src/App.tsx`, `app/src/components/PlaygroundPanel.tsx` |

## CE function contracts

### `runScenario(scenario, modelConfig, repeatIndex, dryRun, bedrockAccount)` — reworked

- Build **OpenAI Chat-Completions** body: `{ model, messages[], max_tokens, temperature }`. Few-shot → user/assistant message pairs; RAG context prepended to the user message (symmetric across models).
- Host by `modelConfig.endpoint`: `runtime` → `bedrock-runtime.{region}.amazonaws.com`, `mantle` → `bedrock-mantle.{region}.api.aws`. Path `/v1/chat/completions`. SigV4 service `bedrock` (existing signer, reused).
- Parse `choices[0].message.content`, `usage.prompt_tokens`, `usage.completion_tokens`; capture `x-amzn-requestid`/`x-request-id`.
- Keep dry-run estimate + 429 → `throttled`.

### `scoreRun(scenario, run, bedrockAccount)` — new

Dispatch on `scenario.scorer_type`:
- `exact` → normalized string equality → 0|1.
- `label` → normalized predicted vs gold label(s) → 0|1.
- `structured_field` → JSON-parse both; field-level precision/recall/**F1** (objects) or set overlap (arrays) → `{score, score_breakdown}`.
- `reference_similarity` → Bedrock Titan embeddings (`amazon.titan-embed-text-v2:0`, InvokeModel via same SigV4) cosine of output vs gold; below threshold → `needs_human_review`.
- Stamp `scorer_version`. Returns `{ status, eval, error }`.

> Deploy + smoke note: both CE functions must be (re)deployed and smoke-tested in Domo; the broker switch from Converse→chat-completions invalidates the prior smoke test (re-run on Llama + DeepSeek + Sonnet inference profile). Never "release" unless explicitly told.

## App data flow

```
bootstrap()  ──load── repos.loadAll() ──┐ (AppDB has data)  → use AppDB
             └─ empty/unavailable ───────┴ → seed from data/seed.ts (+ best-effort write-back)
PlaygroundPanel.runLive() → domo.runScenario → domo.scoreRun → repos.saveRun + repos.saveEval → in-memory + AppDB
```

- **N1 repos:** `loadScenarios/loadModelConfigs/loadRuns/loadEvals`, `saveRun/saveEval/saveScenario/...`. Maps `AppDbDoc<content>` ↔ domain type (`{...content, id}`).
- **N9 seed:** 8 ModelConfigs (Sonnet 4.6 anchor + Nova + Llama + DeepSeek/Qwen/Kimi/GLM/MiniMax) with correct `endpoint`, ids, pricing; reuse the 9 scenarios as initial synthetic seed.
- **Fallback:** if AppDB is unreachable (e.g. running outside Domo), fall back to in-memory seed so the app still renders — `source: 'demo'` badge.

## Exit criteria (demo)

Pick a saved scenario, select Sonnet + DeepSeek + Qwen, run → three **real** outputs with real scores + breakdown, cost, latency, tokens, request ids; reload → runs persisted.

## Out of scope (later slices)

Authoring UI (V2), batch runner (V3), analytics workspace (V4), narrative/memo (V5). V1 keeps the existing Results/Scenarios tabs working on whatever data is loaded.
