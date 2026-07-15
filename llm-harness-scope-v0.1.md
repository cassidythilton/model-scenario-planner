# LLM Market-Fit Investigation Harness — Scope & Requirements (v0.1 draft)

**Owner:** _(you)_  **Status:** Draft for review  **Platform:** Domo (React custom app + CodeEngine) → Amazon Bedrock

---

## 1. Purpose & the decision this informs

This is a **market-investigation tool**, not a one-off benchmark. The goal is to produce defensible evidence about a single business question:

> For which kinds of real Domo-customer tasks does a properly-configured *secondary* model (open-source / cheaper) close the accuracy gap with a *frontier* model enough that the cost savings justify using it — and where does that case break down?

The output is not a winner. It's a **map**: a cost-vs-accuracy picture, segmented by task type, that tells you where the "use a cheaper model" thesis holds and where it doesn't. That map is what makes the "cost will push demand to secondary models" forecast either credible or not.

## 2. Hypotheses under test

- **H1 (economic):** Cost pressure pushes demand toward secondary models. *(Not directly testable here — this tool produces the input to that judgment, not the judgment itself.)*
- **H2 (technical):** With proper context + post-training, a secondary model reaches accuracy similar to a frontier model on a given task.

**Pre-registration requirement (methodology guardrail):** before running batches, the tool must let you fix and record (a) what "similar accuracy" means as a numeric threshold per task type (e.g. "within 3% absolute"), and (b) the configuration budget you'll allow each model. This prevents the unfalsifiable trap where a losing secondary model is endlessly re-tuned until it wins.

## 3. Architecture overview

```
[React Custom App in Domo]  ──invoke──>  [CodeEngine function]  ──>  [Amazon Bedrock: InvokeModel / Converse]
      |  (UI only, no creds)                 |  (holds AWS creds via Domo Account/secret)
      |                                       └──>  [Bedrock Model Evaluation / scoring helpers as needed]
      └──read/write──> [AppDB collections]  <── batch results, scenarios, configs, eval scores
                       [Domo Dataset]        <── flattened run results for reporting/Cards
```

Key decisions locked in this draft:

- **Frontend:** React custom app (Domo App Framework). UI and orchestration only. No AWS credentials client-side.
- **Backend:** Domo **CodeEngine** function(s) broker all Bedrock traffic. AWS credentials are stored server-side via a Domo Account/secret, injected at runtime.
- **Storage:** **AppDB** collections for app state (scenarios, configs, runs, evals). A flattened **Domo Dataset** for the reporting layer / Cards so results are queryable with native Domo viz.
- **Model access:** Bedrock `Converse` API as the common interface across model families (uniform request/response shape simplifies the comparison engine).

## 4. Data model

| Entity | Key fields | Notes |
|---|---|---|
| **Scenario** | id, title, task_type, prompt_template, input_context, gold_answer, scorer_type, source (`synthetic`\|`anonymized_real`), tags | The unit of work. `gold_answer` curated by you. |
| **ModelConfig** | id, label, bedrock_model_id, intervention_level (`zeroshot`\|`fewshot`\|`rag`\|`finetuned`), params (temp, max_tokens), context_strategy_ref | One row per model × intervention combination. |
| **Run** | id, scenario_id, model_config_id, output_text, input_tokens, output_tokens, latency_ms, cost_usd, repeat_index, timestamp, status | One execution. `repeat_index` supports N-repeats for variance. |
| **Eval** | id, run_id, score, score_breakdown, scorer_version, needs_human_review (bool), human_verdict | Score(s) for a run. |
| **Batch** | id, name, scenario_set_ids[], model_config_ids[], preregistered_thresholds, status, cost_estimate, cost_actual | A mass run; carries the pre-registration record. |
| **ScenarioSet** | id, name, scenario_ids[] | Named, reusable collection. |

## 5. Functional requirements

### 5.1 Scenario library & authoring
- Create/edit/tag scenarios via the UI, each with task_type, prompt, optional input context, curated gold answer, and a scorer_type.
- Support both sources you specified: **synthetic (authored by you)** and **anonymized real transcripts** — with a hard requirement (see 7.1) that anonymization happens *before* ingestion.
- Task-type taxonomy (initial): `extraction`, `classification`, `structured_output`, `rag_qa`, `summarization`, `reasoning_multistep`, `agentic` — chosen to span the "gap closes easily" → "gap persists" spectrum so the boundary is visible, not averaged away.
- Import scenarios in bulk (CSV/JSON) and export the library.

### 5.2 Model & intervention registry
- Register any Bedrock model by id and attach an intervention level. The comparison is **model × intervention**, not model alone.
- **Symmetric-control requirement:** any context/RAG/few-shot improvement built for a secondary model must be runnable, unchanged, against the frontier model too. The honest comparison is configured-vs-configured. The UI should make the asymmetric (rigged) comparison hard to do by accident.
- MVP intervention levels: zero-shot, few-shot, RAG. Fine-tuned (SFT/RFT) added in a later phase.

### 5.3 Manual mode ("playground")
- Pick one scenario (or type a freeform prompt), select 2–4 ModelConfigs, execute, and view outputs **side-by-side** with score, cost, latency, and token counts.
- Doubles as the live-demo surface for customer conversations. Should be presentable, not just functional.
- One-click "promote this freeform prompt into a saved Scenario."

### 5.4 Batch mode (mass runs)
- Select a ScenarioSet × a matrix of ModelConfigs → generates the full run grid (scenarios × configs × N repeats).
- **Pre-flight cost estimate** shown before execution; require explicit confirmation to launch (see 7.2).
- Async, queued execution through CodeEngine with progress, retry on transient failures, and resumability.
- Auto-score on completion; persist Runs + Evals; flatten to the reporting Dataset.

### 5.5 Eval engine (gold-answer based)
Scoring uses **your curated gold answers**, with the comparison method selected per task_type so a single brittle exact-match rule doesn't distort open-ended tasks:
- `extraction` / `structured_output`: exact + structured-field match (per-field precision/recall).
- `classification`: exact / label match.
- `rag_qa` / `summarization` / open-ended: reference-based semantic similarity to the gold answer with a configurable threshold; anything below threshold is flagged `needs_human_review` and routed to a lightweight review queue (keeps a human in the loop without resorting to LLM-as-judge, per your preference).
- **Always-on metrics regardless of task:** cost per task, latency (p50/p95), and **run-to-run variance** across the N repeats — reliability is half the story for smaller models and must be a first-class metric, not an afterthought.

### 5.6 Reporting & analysis
- **Cost-performance frontier** per task_type (accuracy vs cost per task; identify the Pareto-efficient configs).
- **Gap-closing-by-intervention** view: how much accuracy each lever (few-shot, RAG) buys, for secondary vs frontier, so you can see whether context helps the small model *more* than it helps the frontier model.
- **Reliability** view: variance / failure-rate per config.
- Pre-registration vs result: did each config hit its declared "similar accuracy" threshold? Pass/fail per task_type.
- Rendered as Domo Cards on the flattened Dataset where possible (reuse native viz) + in-app summary.

## 6. Methodology requirements (the rigor that makes results defensible)

1. Compare configured-vs-configured (symmetric control) — never configured-secondary vs vanilla-frontier.
2. Pre-register the "match" threshold and config budget per batch.
3. Segment everything by task_type; never report a single blended accuracy number.
4. N repeats per run (default N=3, configurable) at non-zero temperature to measure reliability.
5. Use a held-out scenario split so prompt/RAG tuning isn't validated on the same items it was tuned on.
6. Use your own representative scenarios over public benchmarks (contamination + relevance).

## 7. Non-functional requirements

### 7.1 Security & data handling
- **No AWS credentials in the browser.** Credentials live in the CodeEngine function via a Domo Account/secret.
- **PII:** anonymized real transcripts must be scrubbed of customer PII *before* ingestion into the library; the tool stores and sends only anonymized text. Treat anonymization as a documented, auditable pre-processing step.
- Confirm Bedrock's data-isolation posture (prompts not used for training, not shared with model providers) with your AWS account/legal team and record it — don't assume it.
- No customer financial/identity data ever entered into scenarios.

### 7.2 Cost controls
- Per-batch token/cost **ceiling** with hard stop.
- Pre-flight cost estimate required before any batch launch, with explicit user confirmation.
- Per-model rate limiting + exponential backoff on Bedrock throttling.
- Run caps and a "dry run" mode (validate the grid without invoking models).

### 7.3 Reproducibility & observability
- Every Run records model_id, full resolved prompt, params, and versions so any result is reproducible.
- Scorer versioning (`scorer_version`) so re-scoring is traceable.
- Structured logs from CodeEngine for failed/throttled calls.

## 8. MVP scope vs later phases

**MVP (Phase 1) — answer the core question cheaply:**
- Manual + batch modes; CodeEngine ↔ Bedrock via Converse; AppDB storage.
- Interventions: zero-shot, few-shot, RAG.
- Gold-answer scoring for extraction/classification/structured + reference-similarity-with-review for open-ended.
- 3–4 task types spanning the easy/hard boundary; ~100–300 scenarios.
- Frontier anchor + two secondary tiers (e.g. a Nova tier + a Llama tier) — *to confirm*.
- Frontier views: cost-performance frontier, gap-by-intervention, reliability.

**Phase 2 — depth:**
- Fine-tuning arms (Bedrock SFT; RFT on Nova as a near-direct test of H2).
- Human-eval workflow UI; richer review queue.
- Multi-user sharing / role-based access for SE/sales colleagues.
- Scheduled re-runs to track drift as models update.

## 9. Open questions / assumptions to confirm

1. **Model lineup:** assumed 1 frontier anchor + 2 secondary tiers (Nova + Llama), expandable via registry. Confirm the specific families/tiers you want first.
2. **Scale of "mass":** assumed library in the low hundreds, batches up to a few thousand runs. What's your realistic ceiling? (Drives queueing/throughput design.)
3. **Users:** assumed just you for MVP, shareable later. Will SEs/sales need to run it during MVP?
4. **Cost guardrail number:** what monthly Bedrock spend ceiling should the cost controls enforce?
5. **RAG corpus:** for `rag_qa` scenarios, what's the source corpus (Domo docs? KB articles? customer-specific)? This shapes whether you need Bedrock Knowledge Bases in MVP or can stub retrieval.
6. **Reporting home:** in-app React views, native Domo Cards on the Dataset, or both?
