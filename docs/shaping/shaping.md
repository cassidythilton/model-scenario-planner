---
shaping: true
---

# LLM Market-Fit Harness — Overhaul Shaping

Working document for the overhaul. Ground truth for requirements (R), shapes (A/B/C), parts, the metrics model, and the fit check. The "why" lives in [`frame.md`](./frame.md).

**Status:** 🟡 **Shape B SELECTED** and **SLICED** → see [`slices.md`](./slices.md) for the breadboard + V1–V5 build plan. Proven patterns transplanted from the `frontier-inference-architecture` reference app (Appendix F); Shape D folded in. Both spikes resolved ([S1](./spike-mantle-adapter.md), [S2](./spike-anonymization.md)); all open decisions closed. Phase: **Slicing complete — ready to build V1.**

### 🟡 Locked study parameters

| Parameter | Value | Ref |
|---|---|---|
| **Frontier anchor** (R1.1) | Claude Sonnet 4.6 (single anchor, via inference profile) | O3 |
| **Open-weight lineup** (R1.1) | DeepSeek V3.2, Qwen3, Kimi K2.5, GLM 4.7, MiniMax M2.1 — all confirmed in us-east-2 catalog | O4 |
| **Secondary lineup** (R1.1) | Nova tier + Llama tier | scope §9 |
| **Region** | us-east-2 | D2 |
| **Adapter** (R8.2) | One OpenAI Chat-Completions schema + SigV4 signer; `endpoint`=runtime\|mantle per registry entry | S1 |
| **Anonymization** (R2.2) | S2-B vetted manual first pass; pre-write gate + no-raw-field schema | O6/S2 |
| **Cost ceiling** (R5.5/R8.4) | $300/mo hard cap; pre-flight estimate + dry-run + staged scout→confirm | O5 |

---

## Requirements (R)

Top-level requirements are chunked to stay ≤ 9. Sub-requirements add specificity. **R states the need; the *how* lives in the shapes.**

| ID | Requirement | Status |
|----|-------------|--------|
| **R0** | **Core goal:** Replace the demo shell with a harness that produces a *defensible, segmented cost-vs-accuracy map* of secondary/open-weight vs frontier models on real Domo task scenarios — and presents it as a compelling, demo-ready experience. | Core goal |
| **R1** | **Comprehensive comparison matrix** | Must-have |
| R1.1 | Provider-agnostic model lineup: ≥1 frontier anchor + secondary tier(s) + open-weight tier, editable via a registry (add a model = config change, not code change). | Must-have |
| R1.2 | Configuration/intervention ladder per model: zero-shot → few-shot → RAG → fine-tuned (SFT/RFT) → combined, so gap-closing can be attributed to a specific lever. | Must-have |
| R1.3 | Task taxonomy that deliberately spans the easy boundary (extraction, classification, structured output) through the hard boundary (multi-step reasoning, agentic, nuanced drafting), so the boundary is visible, not averaged. | Must-have |
| R1.4 | Symmetric control: any context/RAG/few-shot/tuning built for a secondary model is runnable unchanged against the frontier model; the UI makes the rigged (configured-secondary vs vanilla-frontier) comparison hard to do by accident. | Must-have |
| **R2** | **Real, authorable scenarios** | Must-have |
| R2.1 | Support both synthetic (authored) and anonymized-real (Gong-derived) scenarios, tagged by task type, with curated gold answers + a scorer type each. | Must-have |
| R2.2 | Anonymization is a mandatory pre-storage step; raw transcripts never enter the harness; tokenization is consistent within a scenario. | Must-have |
| R2.3 | Full authoring UI: create/edit/tag scenarios, bulk import/export (CSV/JSON), organize into reusable ScenarioSets. | Must-have |
| R2.4 | Held-out scenario split so prompt/RAG/tuning is not validated on the items it was tuned on. | Must-have |
| **R3** | **The right metrics** (multi-axis, never a single blended number) | Must-have |
| R3.1 | Quality/accuracy via task-specific scorers, reported per task type. | Must-have |
| R3.2 | Cost per task (inference tokens; amortized fine-tune cost over expected volume; on-demand vs provisioned-throughput accounting). | Must-have |
| R3.3 | Latency (p50/p95; time-to-first-token where streaming). | Must-have |
| R3.4 | Reliability: run-to-run variance across N repeats, consistency/pass@k, format-valid rate — reliability is first-class, not an afterthought. | Must-have |
| R3.5 | Failure-mode severity taxonomy (refusal / format error / partial / confident hallucination), weighted — a confidently-wrong answer costs more than a refusal. | Must-have |
| R3.6 | Derived comparatives: gap-to-frontier (absolute + relative), quality-per-dollar, Pareto-frontier membership, gap-closing-by-intervention, break-even volume. | Must-have |
| **R4** | **Honest eval engine** | Must-have |
| R4.1 | Pluggable scorers selected per task type: exact match, structured-field precision/recall/F1, label match, reference-similarity (embeddings). | Must-have |
| R4.2 | Below-threshold open-ended outputs routed to a lightweight human-review queue (human-in-the-loop, no surprise LLM-as-judge). | Must-have |
| R4.3 | Scorer versioning so re-scoring is traceable. | Must-have |
| R4.4 | Pre-registration: fix and record the "match" threshold per task type and the config budget per batch *before* running; report pass/fail against it after. | Must-have |
| **R5** | **Execution engine (manual + mass)** | Must-have |
| R5.1 | Manual playground: pick a scenario (or freeform), select 2–4 model configs, run, see outputs side-by-side with score/cost/latency/tokens; promote freeform → saved scenario. | Must-have |
| R5.2 | Batch runner: expand ScenarioSet × ModelConfig matrix × N repeats into a run grid and execute it. | Must-have |
| R5.3 | Staged execution: cheap wide "scout" pass (N=1, eliminate dominated cells) → deeper "confirm" pass (N=3) only on survivors. | Must-have |
| R5.4 | Async/queued, resumable, with retry + exponential backoff on throttling. | Must-have |
| R5.5 | Cost safety: per-batch pre-flight estimate + explicit confirm, hard cost ceiling, dry-run mode. | Must-have |
| **R6** | **Compelling showcase experience** | Must-have |
| R6.1 | Narrative reporting that renders the "map": cost-performance Pareto per task type, gap-closing-by-intervention, reliability view — with a guided story, not just raw charts. | Must-have |
| R6.2 | Drill-down from any cell to the actual model output(s) vs gold, with score breakdown and diffs. | Must-have |
| R6.3 | Playground is presentable enough to demo live in a customer conversation. | Must-have |
| R6.4 | Pre-registration verdict view: did each config hit its declared threshold, per task type. | Must-have |
| R6.5 | Modern, polished UI (real charting, responsive, on-brand). | Nice-to-have |
| **R7** | **Persistence & reproducibility** | Must-have |
| R7.1 | Real AppDB persistence for all entities; state survives reload; no hardcoded result data. | Must-have |
| R7.2 | Every Run records resolved prompt, params, model id, scorer version, repeat index — fully reproducible. | Must-have |
| R7.3 | Export results (and library) for durability/backup and external analysis. | Nice-to-have |
| **R8** | **Platform & security constraints** | Must-have |
| R8.1 | React custom app in Domo; UI/orchestration only; no AWS credentials client-side. | Must-have |
| R8.2 | CodeEngine brokers all Bedrock traffic via an adapter layer covering both the Converse path (Claude/Nova/Llama) and the mantle/chat-completions path (Qwen/Kimi/GLM/etc.). | Must-have |
| R8.3 | Data-isolation posture (prompts not used for training / not shared with providers) documented for both paths before Gong-derived content flows. | Must-have |
| R8.4 | Cost guardrails enforced server-side (rate limiting, ceilings) regardless of UI. | Must-have |

---

## CURRENT: The demo shell (baseline)

| Part | Mechanism | Flag |
|------|-----------|:----:|
| CUR1 | Three-tab React SPA (`Playground`/`Results`/`Scenarios`), CSS `display` toggle, no router. | |
| CUR2 | All scenarios/models/runs/evals hardcoded in `app/src/data/demoHarness.ts` (135 synthetic runs). | |
| CUR3 | One live path: `runScenario` → Bedrock **Converse** for 2 runnable models; in-memory session results. | |
| CUR4 | Client-side scoring stub: constant score except a single substring (`label`) match. | |
| CUR5 | AppDB wrappers (`lib/domo.ts`) defined but unused; no persistence. | |
| CUR6 | Metrics aggregation (`lib/metrics.ts`) is real and reusable. | |

CURRENT satisfies almost none of R fully — it's a UX sketch over synthetic data. The shapes below describe how to get from CUR to R0.

---

## A: Incremental hardening (evolve the SPA in place)

Keep the existing three-tab SPA and harden it piece by piece: swap demo data for AppDB, replace the scoring stub, light up more models, add a minimal batch loop. Lowest disruption; the app's structure stays as-is.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **Persist in place** — wire `lib/domo.ts` AppDB CRUD into the existing components; replace `demoHarness.ts` reads with AppDB reads; seed collections once. | |
| **A2** | **Real scorer (client-side)** — implement structured-field F1 + label match in `lib/`; embedding similarity via a CodeEngine embeddings call. | |
| **A3** | **More models, same path** — register the remaining Converse-reachable models; mark mantle-only models unavailable for now. | ⚠️ |
| **A4** | **Inline batch loop** — a simple front-end loop over the grid calling `runScenario` sequentially with a progress bar; no server queue. | |
| **A5** | **Scenario edit forms** — add create/edit modals to the existing read-only library. | |
| **A6** | **Reporting upgrade** — replace hand-rolled SVG with Recharts on the existing Results tab. | |

---

## B: Experiment-platform rebuild (run-centric harness)

Re-center the app as an experiment-tracking tool (think a focused, comparison-specific W&B/MLflow): AppDB is the source of truth, a server-side batch orchestrator runs the matrix, a real eval engine scores in CodeEngine, and a deep analytics workspace renders the map with drill-down. Maximizes R1–R7 rigor.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **B1** | **AppDB data layer** — typed repositories for Scenario, ModelConfig, Run, Eval, Batch, ScenarioSet; app types reconciled 1:1 with collection schemas; demo data becomes optional seed only. | |
| **B2** | **Registry + adapter layer** — provider-agnostic ModelConfig registry driving a CodeEngine adapter. 🟡 *S1 resolved:* one **OpenAI Chat-Completions** schema + one SigV4 signer parameterized by host (`bedrock-runtime` for Claude/Nova/Llama, `bedrock-mantle.{region}.api.aws` for open-weight) — collapses the two-adapter assumption to one code path. Registry entry carries `endpoint` (runtime\|mantle) + `model_id` + pricing. | |
| **B3** | **Scenario authoring + Gong pipeline** — authoring UI (CRUD, tag, import/export, ScenarioSets, held-out split flag) + anonymize-then-structure ingestion. 🟡 *S2 resolved:* a pre-write anonymization gate (Comprehend `DetectPiiEntities` + org/person NER → consistent token map → mandatory human confirm); no-raw-field schema guarantees raw transcripts never persist. | |
| **B4** | **Eval engine in CodeEngine** — `scoreRun` dispatching on `scorer_type`: exact, structured-field P/R/F1, label, reference-similarity (Bedrock embeddings); `needs_human_review` flag + review queue; `scorer_version` on every Eval. | |
| **B5** | **Execution engine** — manual playground (B5a) and batch matrix runner (B5b): grid expansion, N-repeats, async chunked queue with resume/retry/backoff, dry-run, pre-flight cost estimate, hard ceiling. | |
| **B6** | **Methodology guardrails** — pre-registration record on the Batch (per-task threshold + config budget), symmetric-control enforcement in config selection, held-out split honored, staged scout→confirm flow. | |
| **B7** | **Analytics workspace** — Recharts views: Pareto frontier per task type, gap-closing-by-intervention, reliability/variance, pre-registration pass/fail; cell → run drill-down with output-vs-gold diff and score breakdown. 🟡 *Borrow:* fat-analytics-endpoint / thin-client (pre-compute hero+timeline+scatter+fingerprints), workload(task-type)-scoped leaderboard metric so there's no false "one winner," and a cross-task **Compare** view (small multiples per question). | |
| **B8** | **Showcase layer** — a guided narrative ("the map") wrapping B7 + a presentation-grade playground for live customer demos. 🟡 *Borrow:* exportable **PDF/share memo** as the customer deliverable, and a "what we measured vs what we'd test next" honesty footer. | |
| **B9** | 🟡 **RunConfig contract + provenance** (transplant) — every run is a hashable, inspectable `RunConfig` JSON shown before execution; persist the resolved config + `config_hash` so results are reproducible, cacheable, and auditable. Reconciliation: store the Bedrock request id (`x-amzn-requestid`/response metadata) on every Run so numbers are verifiable against AWS. | |
| **B10** | 🟡 **Streaming + demo/cache mode** (transplant) — stream runs (SSE-style) for live progressive feedback during multi-model sweeps (capture time-to-first-token); a **demo mode** that replays cached runs by `config_hash` so live customer demos cost $0 and are deterministic. | |

> B2 and B3 carry the only flagged unknowns; both have a spike below. B9/B10 are de-risked — proven in the reference app (Appendix F).

---

## C: Showcase-led (narrative demo + live playground first)

Optimize first for the compelling experience and the live customer-demo surface, backed by a *real but smaller* engine: curated scenarios, live side-by-side across a few models, a story-driven map. Mass-batch rigor is added behind it later rather than being the organizing principle.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **C1** | **Guided narrative experience** — a "story mode" that walks a curated set of scenarios and reveals the cost-vs-accuracy map as a designed narrative; the showcase is the product. | |
| **C2** | **Presentation-grade live playground** — polished side-by-side multi-model run with live tokens/cost/latency and output-vs-gold reveal, built to be shown to customers. | |
| **C3** | **Real-but-light engine** — real `runScenario` across the runnable model set + real scorers (B4 subset), persisted to AppDB, but no large-scale batch queue at first. | ⚠️ |
| **C4** | **Curated evidence set** — a small, hand-built high-quality scenario library (a few archetypes) instead of mass ingestion; Gong/anonymization deferred. | |
| **C5** | **Batch later** — add the staged batch runner + full registry/adapter as a follow-on once the showcase lands. | ⚠️ |

---

## D: Frontier decision-loop transplant (proven, leaner) 🟡

A smaller shape derived from the user's prior `frontier-inference-architecture` app (Appendix F), which already shipped a working SE-facing comparison tool. Reuse its **proven decision-loop** — `RunConfig → stream → persist → aggregate → compare → memo` — and its demo discipline, mapped onto Bedrock. Trades B's full experiment-platform breadth for a faster, already-validated path to a defensible-enough, demo-ready result. Quality eval and mass-matrix are deliberately lighter than B.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **D1** | **RunConfig-as-contract** — one hashable JSON unit of work (workload/task + models + params), shown before execution, persisted with `config_hash` for cache replay + audit. (Proven: `models.py`/`schemas.ts`.) | |
| **D2** | **Single shared contract across UI + backend** — Zod (React) ↔ the CodeEngine function types kept in sync, so the comparison shape can't drift. | |
| **D3** | **Streaming bench runner** — fan out one task per model, prompts sequential with RPM pacing + 429 backoff; stream per-row results for live feedback; capture TTFT, latency, tokens, cost, request id. (Proven: `main.py`/`baseten_client.py`.) | |
| **D4** | **Bedrock adapter (replace Baseten client)** — the one piece the reference app lacks. 🟡 *S1 resolved:* OpenAI Chat-Completions over `bedrock-runtime`/`bedrock-mantle` via the existing SigV4 signer; the reference app's OpenAI-style client maps over almost directly. | |
| **D5** | **Workload-scoped leaderboards + Compare view** — per-task winner on the axis that matters (cost vs latency vs quality), plus a cross-task Compare tab (small multiples). (Proven: `analytics.py`/`Analytics.tsx`.) | |
| **D6** | **Demo/cache mode + PDF memo + hypotheses footer** — $0 deterministic demos via cache replay, customer-deliverable memo export, and a "measured vs to-test" honesty footer. (Proven: `useCredits.ts`, `Memo.tsx`.) | |
| **D7** | **Rule-based recommender (optional)** — deterministic, diffable "use model X for task Y because… (why_not …)" opinion to anchor the narrative without an LLM judge. (Proven: `recommend.py`.) | |

> **Relationship to B:** D is not a rival destination — it's the *proven core loop*. Its strong parts (D1, D3, D5, D6) are transplanted into B as B9/B10 and the Borrow notes on B7/B8. D's gap vs R0: lighter on the honest **quality eval** (R4), the full **intervention ladder** (R1.2), **mass staged batch** (R5.3), and **Gong scenarios** (R2.1) — which is exactly what B adds on top.

---

## Fit Check

Top-level requirements vs the three shapes. Binary: a flagged-unknown mechanism counts as ❌ until a spike resolves it.

| Req | Requirement | Status | A | B | C | D |
|-----|-------------|--------|---|---|---|---|
| R0 | Defensible, segmented cost-vs-accuracy map + compelling demo-ready experience | Core goal | ❌ | ✅ | ❌ | ❌ |
| R1 | Comprehensive comparison matrix (models × interventions × task types, symmetric) | Must-have | ❌ | ✅ | ❌ | ❌ |
| R2 | Real, authorable scenarios (synthetic + anonymized Gong, sets, held-out split) | Must-have | ❌ | 🟡 ✅ | ❌ | ❌ |
| R3 | The right metrics (quality/cost/latency/reliability/failure-severity + derived) | Must-have | ❌ | ✅ | ❌ | ❌ |
| R4 | Honest eval engine (pluggable scorers, review queue, versioning, pre-registration) | Must-have | ❌ | ✅ | ❌ | ❌ |
| R5 | Execution engine (manual + mass, staged, async/resumable, cost-safe) | Must-have | ❌ | ✅ | ❌ | ❌ |
| R6 | Compelling showcase (narrative map, drill-down, demo-ready, pre-reg verdict) | Must-have | ❌ | ✅ | ✅ | ✅ |
| R7 | Persistence & reproducibility (real AppDB, full provenance) | Must-have | ✅ | ✅ | ✅ | ✅ |
| R8 | Platform & security (no client creds, dual-path adapter, isolation, guardrails) | Must-have | ❌ | 🟡 ✅ | ❌ | ❌ |

**Notes:**
- **A fails R0/R1/R3/R5/R6:** an in-place front-end loop (A4) isn't a real mass-execution engine (no server queue, resume, staged scout/confirm, or enforced ceiling); no intervention ladder or symmetric control (R1); client-side scoring can't host the full metric/severity model cleanly (R3); reporting stays shallow (R6).
- **A fails R8:** A3 leaves the mantle path unimplemented (⚠️), so the dual-path adapter requirement is unmet.
- 🟡 **B now passes R2** (Spike S2 resolved): the anonymization mechanism is understood — Comprehend PII + org/person NER → consistent token map → mandatory human-confirm pre-write gate; no-raw-field schema. Only the S2-A-vs-S2-B first-batch choice remains (a decision, not a mechanism unknown).
- 🟡 **B now passes R8** (Spike S1 resolved): one OpenAI Chat-Completions schema + one SigV4 signer over `bedrock-runtime`/`bedrock-mantle` covers all model families; remaining work is registry population + in-region availability (O4), not adapter design.
- **C fails R0–R5:** by design it defers mass batch (C5), full registry/adapter, and real scenario ingestion (C4) — it optimizes R6 and a real-but-light slice of R3/R4 only.
- **D fails R1/R3/R4/R5:** the transplanted loop is real and proven but deliberately lighter — no full intervention ladder (R1.2), no honest task-quality eval engine (R4, the reference app has *no* quality scoring), no staged mass batch (R5.3). It's a strong core, not the comprehensive harness.
- **A still fails R8 by choice:** A3 deliberately leaves the open-weight path unimplemented, so even with S1 resolved A doesn't deliver the full lineup.

**Reading:** With both spikes resolved, **B clears every requirement** and is confirmed. C is a *sequencing* of B (showcase-first). **D is the proven core loop** from the prior app: its best parts (RunConfig contract, streaming bench, workload-scoped leaderboards, demo/cache mode, PDF memo) are transplanted into B as **B9/B10** and the Borrow notes on B7/B8 — but on its own D is too light on quality eval and the intervention ladder to satisfy R0. A is genuinely insufficient.

---

## Decision & composition

**🟡 Selected: Shape B = experiment-platform rebuild, built on D's proven loop, sequenced to deliver the showcase early.**

> **B (B1–B8) + D's proven core (B9 RunConfig contract, B10 streaming/demo-cache) + B7/B8 borrow notes (workload-scoped leaderboards, Compare view, PDF memo, honesty footer)**, with the showcase playground stood up first on a real-but-light slice (the C sequencing) before the full mass-batch matrix.

Why this composition:
- **B** is the only shape that reaches R0 (defensible + comprehensive + compelling).
- **D** de-risks the build: the `RunConfig → stream → persist → aggregate → compare → memo` loop is already proven in `frontier-inference-architecture`, so we transplant the loop and replace only its provider client with the Bedrock adapter.
- **C's sequencing** gives an early demo-able surface.

The one genuinely new build vs the reference app is the **Bedrock adapter (Converse + mantle)** — Spike S1 — plus the **honest quality eval engine** (B4) and **Gong pipeline** (B3, Spike S2), which the reference app never had.

---

## Appendix M: The metrics model (answers "what would the metrics be?")

Metrics are computed **per Run**, then aggregated **per (model × intervention × task_type)**. Never reported as one blended number (R3, methodology guardrail #3).

### M1. Quality / accuracy — task-specific (R3.1, R4.1)

| Task type | Primary metric | Scorer |
|-----------|----------------|--------|
| extraction | field precision / recall / F1; exact-match rate | structured-field |
| structured_output | field P/R/F1; schema-valid rate | structured-field |
| classification | accuracy, macro-F1, per-label confusion | label match |
| rag_qa | answer correctness vs reference; groundedness/faithfulness; retrieval hit-rate | reference + retrieval check |
| summarization | reference similarity (embedding cosine); rubric coverage | reference-similarity + human review |
| reasoning_multistep | rubric score; reference similarity | reference-similarity + human review |
| agentic | task-completion / step-success rate | rubric / structured |

### M2. Cost (R3.2)

- Cost per task = input_tokens × price_in + output_tokens × price_out.
- Amortized fine-tune cost spread over expected request volume (so SFT/RFT arms are costed honestly).
- On-demand vs provisioned-throughput accounting (Nova custom models bill per-call; some custom models require provisioned throughput — materially different economics).

### M3. Latency (R3.3)

- p50 and p95 wall-clock per task; time-to-first-token where the path streams.

### M4. Reliability (R3.4)

- Variance / stddev of score across N repeats (non-zero temperature).
- Consistency / pass@k (how often it gets it right across repeats).
- Format-valid rate (did it return parseable JSON when required) — a small model that's 90% accurate but fails unpredictably is worse than the number implies.

### M5. Failure-mode severity (R3.5)

- Taxonomy: refusal · format error · partial · confident hallucination.
- Severity-weighted, because a confidently-wrong extraction has a higher downstream cost than a refusal.

### M6. Token efficiency

- Output tokens per task (verbosity) and input-token footprint — feeds cost and latency.

### M7. Derived comparatives (R3.6) — the deliverable lives here

- **Gap-to-frontier:** absolute (frontier_score − config_score) and relative (%), per task type.
- **Quality-per-dollar:** score ÷ cost_usd.
- **Pareto-frontier membership:** is the config non-dominated on (quality, cost)? → the cost-performance frontier per task type.
- **Gap-closing-by-intervention:** Δscore added by each lever (few-shot, RAG, fine-tune) — *for secondary vs frontier* — to test whether context helps the small model more than it helps the frontier model.
- **Break-even volume:** request volume at which amortized fine-tune cost beats frontier on-demand.
- **Pre-registration verdict:** did the config hit its declared threshold, per task type → pass/fail (R4.4, R6.4).

### M8. Recorded methodological context (not metrics, but required for defensibility)

- N repeats, temperature, held-out split membership, scorer_version, pre-registered threshold, config budget consumed.

---

## Appendix F: Insights from `frontier-inference-architecture` (prior app)

The user's earlier app (Baseten Model APIs, FastAPI + React, SQLite) is a working SE-facing inference-comparison tool. It is **single-provider** (no Bedrock, no Converse, no multi-provider adapter, and notably **no quality/accuracy eval** — that was an explicit non-goal). Its value here is the **proven decision-loop architecture and demo discipline**, transplanted into Shape B.

### Patterns worth transplanting (→ where they land in B)

| # | Pattern (from prior app) | Why it's good | Lands in |
|---|---|---|---|
| F1 | **`RunConfig` as the unit of work** — hashable, inspectable JSON shown before run | Reproducibility + cache replay + audit trail | B9 |
| F2 | **Single shared schema** (Zod ↔ backend types, kept in sync) | Comparison contract can't silently drift across UI/CE | B9, D2 |
| F3 | **SSE streaming bench, per-row persistence** | Live progressive feedback during long multi-model sweeps | B10 |
| F4 | **Demo/cache mode** — replay by `config_hash`, $0 deterministic demos | Customer demos without live burn | B10 |
| F5 | **Provider request-id as first-class field + deep-link** | Trust: customer can reconcile your numbers against the provider dashboard (Bedrock: `x-amzn-requestid`) | B9 |
| F6 | **Workload-scoped leaderboard metric** (cost vs TTFT p95 vary by workload) | Avoids false "one winner" narrative — matches our per-task-type rule | B7 |
| F7 | **Bench-vs-projection framing** (validate at test scale, project economics at scale) | SE credibility; ties to break-even volume (M7) | B7 |
| F8 | **Fat analytics endpoint, thin client** (pre-computed hero/timeline/scatter/fingerprints) | Clean rendering; could feed Domo cards later | B7 |
| F9 | **Compare tab = cross-workload question panels** (small multiples, overlays) | Portfolio-level synthesis, not three stacked pages | B7 |
| F10 | **PDF memo export + "measured vs to-test" hypotheses footer** | Customer deliverable + honesty about eval gaps | B8 |
| F11 | **Rule-based recommender with `why_not`** (deterministic, diffable) | Anchors narrative without an LLM judge | B8 (optional) |
| F12 | **Seed script for demo-ready analytics** | Demos/dev without live cost | B10 |

### What the prior app does NOT have (so we must build it)

- **Multi-provider adapter** — it's hard-wired to one OpenAI-compatible client. Our Bedrock Converse + mantle adapter (B2/D4) is net-new → **Spike S1**.
- **Quality / accuracy eval** — none; recommender is pure rules. Our honest eval engine (B4: structured-field F1, label, reference-similarity, human review) is net-new and central to R0.
- **Intervention ladder** (few-shot/RAG/fine-tune), **mass staged batch**, **scenario authoring/Gong**, **pre-registration** — all net-new in B.

### Reference paths (in `/tmp/frontier-inference-architecture`, read-only clone)

| Concern | Path |
|---|---|
| Bench SSE entry | `apps/api/app/main.py` |
| Provider client (the part we replace) | `apps/api/app/baseten_client.py` |
| Cost calc + pricing table | `apps/api/app/pricing.py`, `configs/pricing.yaml` |
| Analytics aggregation | `apps/api/app/analytics.py` |
| Shared contract | `packages/shared/src/schemas.ts` |
| Compare UX | `apps/web/src/pages/Analytics.tsx` |
| Workload prompts/scenarios | `configs/workloads/*.yaml` |

---

## Spikes — both RESOLVED ✅

- **S1 — Mantle / chat-completions adapter** (unblocked B2/D4 → R8): **resolved** — open-weight models use OpenAI Chat-Completions at `bedrock-mantle.{region}.api.aws/v1`, and Chat-Completions also runs on the existing `bedrock-runtime` SigV4 path, so one schema + one signer covers all families. Full findings: [`spike-mantle-adapter.md`](./spike-mantle-adapter.md). 🟡 *O4 resolved:* DeepSeek V3.2, Qwen3, Kimi K2.5, GLM 4.7, MiniMax M2.1 all confirmed in the us-east-2 catalog.
- **S2 — Gong anonymization** (unblocked B3 → R2): **resolved** — Comprehend `DetectPiiEntities` + org/person NER via the same SigV4 pattern, consistent token map, mandatory human-confirm pre-write gate, no-raw-field schema. Full findings: [`spike-anonymization.md`](./spike-anonymization.md). 🟡 *O6 resolved:* **S2-B** (vetted manual first pass) for the first batch; automated scrubber deferred.

---

## Next steps — SLICED ✅

Shape B is broken into 5 vertical slices in [`slices.md`](./slices.md), each ending in demo-able UI:
1. **V1 — Persisted, real-scored playground** (B1, B2/S1, B4 core, B9) — real runs, real scores, persisted. Early demo surface.
2. **V2 — Authoring, sets & registry** (B3 synthetic/S2-B, intervention ladder, symmetric control).
3. **V3 — Batch engine + guardrails + cache** (B5, B6, B10, $300 ceiling).
4. **V4 — Analytics workspace** (B7, full metrics).
5. **V5 — Showcase + full breadth** (B8, mantle confirm, Gong via S2-B).

Per-slice implementation detail belongs in `V1-plan.md`, `V2-plan.md`, … created when each slice starts.
