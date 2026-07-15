# LLM Market-Fit Harness — Build Plan & Technical Spec (v0.1)

Companion to `llm-harness-scope-v0.1.md`. This folds in your answers to the open questions and specs the next layer of detail: the model adapter, the Gong→scenario method, the cost strategy, the phased plan, and the CodeEngine function contract.

---

## 0. Scope deltas from your answers

| # | Decision | Impact on the build |
|---|---|---|
| 1 | Model lineup = frontier anchor + Nova + Llama **+ Kimi, DeepSeek, Qwen** | Requires an **adapter layer** in CodeEngine (two Bedrock paths — see §1). Registry must be provider-agnostic. |
| 2 | Scale = low-hundreds library, batches up to a few thousand runs | Async queue with chunked execution + resumability; not a fire-and-forget single call. |
| 3 | Users = just you for MVP, shareable later | No auth/roles in MVP. Keep data model multi-user-ready so Phase 2 sharing is additive. |
| 4 | Cost = "reasonable, but adequate testing" | **Staged execution** strategy (§3) so budget is spent on interesting cells, not obviously-dominated ones. Suggested ceiling + hard caps. |
| 5 | Scenario source = **Gong transcripts**, structured per direction | Concrete scenario schema + anonymization pipeline (§2). This is now your primary real-data path and your most sensitive one. |
| 6 | Reporting = **full custom React app, no Domo Cards** | Drop the flattened Dataset/Cards path from scope §5.6. Reporting is in-React (e.g. Recharts). AppDB remains the store; optional Dataset export kept only for durability/backup. |

---

## 1. Model registry & adapter layer

### The two paths
- **`bedrock-runtime` (Converse API):** Claude, Nova, Llama, Mistral. Uniform request/response, native tool use, prompt caching on Claude/Nova.
- **`bedrock-mantle` / Chat-Completions path:** open-weight models — DeepSeek (V3.2/V3.1/R1), Qwen3 family, Kimi (K2.5 / K2 Thinking), GLM, MiniMax. Some (e.g. DeepSeek V3.2/V3.1) also advertise Converse, but treat the mantle/chat-completions path as the reliable common denominator for this group.

### Design implication
The CodeEngine function exposes **one normalized internal contract** (§6) and internally routes per model via an adapter:

```
normalizedRequest ──> adapter.select(model)
                        ├── ConverseAdapter   (bedrock-runtime)
                        └── ChatCompletionsAdapter (bedrock-mantle / OpenAI-compatible)
                      ──> normalizedResponse  {text, input_tokens, output_tokens, latency_ms, cost_usd, raw}
```

Registry entries carry everything the adapter needs, so adding a model is a config change, not a code change:

```json
{
  "label": "DeepSeek V3.2",
  "bedrock_model_id": "deepseek.v3.2",
  "path": "mantle",                 // "runtime" | "mantle"
  "supports_tool_use": true,
  "supports_prompt_cache": false,
  "price_per_1k_input": 0.00,       // fill from current Bedrock pricing
  "price_per_1k_output": 0.00,
  "max_context": 164000
}
```

> **Verify at build time:** exact model IDs and per-token prices change frequently (IDs use varied prefixes like `deepseek.v3.2`, `qwen.qwen3-...`, `moonshotai.kimi-k2.5`). Pull both from the live Bedrock console/pricing page when you populate the registry rather than hardcoding from memory.

### Governance note
Add Bedrock Guardrails to the open-weight configs as defense-in-depth, and record (with your AWS/security contact) the data-isolation posture for the mantle path before any Gong-derived content flows through it.

---

## 2. Gong transcripts → scenarios (the method)

This is where realism comes from, and it's your most sensitive data path. Two stages: **anonymize**, then **structure into tasks**.

### 2.1 Anonymization pipeline (mandatory, before storage)
A pre-processing step (a dedicated CodeEngine function or a vetted manual pass) that runs on every transcript *before* it enters AppDB:
- Replace identifiers with stable tokens: `[CUSTOMER]`, `[REP]`, `[COMPANY_A]`, `[COMPANY_B]`, `[EMAIL]`, `[PHONE]`, `[$AMOUNT]` where the figure is sensitive.
- Strip anything that re-identifies (account IDs, unusual product configs, named individuals).
- Store only the anonymized excerpt. The raw transcript never lands in the harness.
- Keep the mapping (if any) outside the harness, access-controlled.

> Tokenization must be **consistent within a scenario** so the task still makes sense (the model needs `[CUSTOMER]` to refer to the same party throughout).

### 2.2 Task archetypes derived from sales calls
Each archetype maps a recurring sales-call moment to a task type and a scoring method. These are your initial scenario factory:

| Archetype | Task type | Gold answer you curate | Scorer |
|---|---|---|---|
| Call summary | `summarization` | Reference summary | semantic similarity + human review |
| Next steps / action items | `extraction` / `structured_output` | List of action items (JSON) | structured-field P/R |
| Objection identification | `classification` | Objection label(s) | label match |
| Customer product question | `rag_qa` | Correct answer grounded in product docs | reference match (+ retrieval check) |
| Follow-up email draft | open-ended | Reference email + rubric | rubric/reference, human review |
| Deal qualification fields (e.g. MEDDIC) | `structured_output` | Field/value map | structured-field P/R |
| Competitor mention extraction | `extraction` | Competitors named | structured-field P/R |
| Risk / red-flag detection | `classification` | Risk present? + type | label match |

This set deliberately spans the easy-gap-closes end (extraction, classification) and the gap-persists end (multi-turn reasoning, nuanced email drafting), so the boundary shows up in results.

### 2.3 Scenario schema (Gong-specialized)
Extends the base Scenario from the scope doc:

```json
{
  "id": "scn_0142",
  "title": "Q3 renewal call — next steps",
  "task_type": "structured_output",
  "source": "anonymized_real",
  "source_ref": "gong_call_anon_0142",      // anonymized handle only
  "input_context": "<anonymized transcript excerpt>",
  "instruction": "Extract all committed next steps with owner and due date.",
  "gold_answer": [{"action": "...", "owner": "[REP]", "due": "..."}],
  "scorer_type": "structured_field",
  "tags": ["renewal", "multistakeholder"]
}
```

A multilingual sub-tag is worth adding if any calls aren't in English — DeepSeek/Qwen multilingual strength is a real axis where the secondary-model case may be strongest, and it's cheap to test.

---

## 3. Cost strategy ("reasonable, but adequate")

The full grid (scenarios × configs × interventions × N repeats) gets expensive fast, and most of that spend is wasted on configurations that are obviously dominated. So spend in **two stages**:

**Stage 1 — Scout (cheap, wide):** small sample (~20–30 scenarios per task type), N=1, every model × intervention. Goal: find which cells are even competitive. Cheap models run freely; this pass is mostly to *eliminate*.

**Stage 2 — Confirm (deeper, narrow):** full scenario set, N=3 for variance, **only** on the configs/task-types that survived Stage 1. This is where the defensible numbers come from.

Additional controls (already in scope §7.2, parameters here):
- **Suggested monthly ceiling:** start around **$300–$500** of Bedrock spend for the investigation phase — enough for staged testing across the model set without runaway cost. Make it a setting; enforce as a hard cap.
- **Pre-flight estimate** on every batch: runs × est. tokens × per-model price → shown before launch, requires confirmation.
- **Prompt caching** on Claude/Nova for shared RAG context and few-shot blocks (real savings when the same context repeats across a scenario set).
- **Sane `max_tokens`** per task type; don't let open-ended tasks run unbounded.
- **Dry-run mode**: build/validate the run grid and cost estimate without invoking any model.

---

## 4. Phased build plan

### Phase 0 — Foundation (plumbing only)
- CodeEngine function: normalized contract + ConverseAdapter, wired to the React app via `manifest.json`; AWS creds in a Domo Account/secret.
- AppDB collections for Scenario, ModelConfig, Run, Eval, Batch, ScenarioSet.
- Smoke test: one scenario, one Claude config, round-trip result persisted.

### Phase 1 — MVP (answers the core question)
- Add ChatCompletionsAdapter; register the full model set (Claude anchor, Nova, Llama, DeepSeek, Qwen, Kimi).
- Scenario authoring UI + Gong anonymization pass + first ~100–300 scenarios across 3–4 task archetypes.
- Interventions: zero-shot, few-shot, RAG (stubbed retrieval acceptable at first — see scope §9.5).
- Eval engine: gold-answer scorers (exact / structured-field / reference-similarity-with-review).
- Manual mode (side-by-side playground) + batch mode (staged execution, cost guardrails).
- React reporting views: cost-performance frontier, gap-by-intervention, reliability, pre-registration pass/fail.

### Phase 2 — Depth
- Fine-tuning arms (Bedrock SFT; RFT on Nova as a near-direct test of H2).
- Real RAG via Bedrock Knowledge Bases over the product-docs corpus.
- Human-eval review queue UI; multi-user sharing + roles.
- Scheduled re-runs to track drift as models update.

---

## 5. Decision: CodeEngine language
Use **Python** for the Bedrock-facing function (boto3 `bedrock-runtime` + the mantle/chat-completions client). Cleaner SDK ergonomics for both paths than JS. The React app calls it through the App Framework's CodeEngine wiring.

---

## 6. CodeEngine function contract

### 6.1 `runScenario` — request
```json
{
  "scenario": {
    "id": "scn_0142",
    "instruction": "Extract all committed next steps with owner and due date.",
    "input_context": "<anonymized excerpt>",
    "task_type": "structured_output"
  },
  "model_config": {
    "bedrock_model_id": "deepseek.v3.2",
    "path": "mantle",
    "intervention": "fewshot",
    "params": { "temperature": 0.2, "max_tokens": 1024 },
    "fewshot_examples": [ ... ],
    "rag_context": null
  },
  "repeat_index": 0,
  "dry_run": false
}
```

### 6.2 `runScenario` — response
```json
{
  "status": "ok",
  "run": {
    "scenario_id": "scn_0142",
    "model_config_id": "cfg_deepseek_fewshot",
    "repeat_index": 0,
    "output_text": "...",
    "input_tokens": 812,
    "output_tokens": 240,
    "latency_ms": 1840,
    "cost_usd": 0.0021,
    "model_id_resolved": "deepseek.v3.2",
    "timestamp": "2026-06-01T18:22:00Z"
  },
  "error": null
}
```
On `dry_run: true`, return the estimated cost/tokens and skip the model call. On throttling, return `status: "throttled"` so the queue can back off and retry.

### 6.3 Scoring handlers (`scoreRun`)
Dispatch on `scorer_type`:
- `exact` → normalized string equality → {score: 0|1}
- `structured_field` → parse JSON, per-field precision/recall/F1 vs gold → {score, breakdown}
- `label` → predicted vs gold label(s) → {score, breakdown}
- `reference_similarity` → embedding cosine vs gold; below threshold → `needs_human_review: true`

Every Eval records `scorer_version` for traceability.

### 6.4 Batch orchestration
The React app expands a Batch into the run grid and calls `runScenario` in chunks (respecting per-model rate limits), writing Runs and Evals to AppDB as they complete, with progress + resume on the Batch record. Pre-flight `dry_run` across the grid produces the cost estimate gate.

---

## 7. Still to confirm
- **Cost ceiling number:** is ~$300–$500/month a reasonable starting cap, or do you have a specific figure?
- **Anonymization ownership:** automated CodeEngine scrubber vs. a vetted manual pass for the first batch of Gong calls? (Affects Phase 1 timeline.)
- **Frontier anchor:** which specific model is the "frontier" baseline to beat (latest Claude on Bedrock, presumably)?
- **Multilingual:** any non-English Gong calls worth making a dedicated task axis?
