# LLM Market-Fit Investigation Harness

**Context in. Governed evidence out.** A Domo-hosted harness that investigates a single business question: *for which real customer tasks does a properly-configured secondary (open-source / cheaper) model close the accuracy gap with a frontier model enough that the cost savings justify it — and where does that case break down?*

The output is not a winner. It is a **cost-vs-accuracy map, segmented by task type.**

<p>
  <img alt="Delivered on Domo" src="https://img.shields.io/badge/Delivered%20on-Domo-2C6EF2?style=for-the-badge" />
  <img alt="Powered by Amazon Bedrock" src="https://img.shields.io/badge/Powered%20by-Amazon%20Bedrock-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white" />
  <img alt="Built with React" src="https://img.shields.io/badge/Built%20with-React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="Typed in TypeScript" src="https://img.shields.io/badge/Typed%20in-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
</p>
<p>
  <img alt="Bundled with Vite" src="https://img.shields.io/badge/Bundled%20with-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="Charts by Recharts" src="https://img.shields.io/badge/Charts-Recharts-22B5A0?style=for-the-badge" />
  <img alt="Backend on Domo Code Engine" src="https://img.shields.io/badge/Backend-Domo%20Code%20Engine-1E293B?style=for-the-badge" />
  <img alt="State in AppDB" src="https://img.shields.io/badge/State-Domo%20AppDB-1E293B?style=for-the-badge" />
</p>
<p>
  <img alt="Method from Shape Up" src="https://img.shields.io/badge/Method-Shape%20Up-6B7280?style=for-the-badge" />
  <img alt="Phase 1 MVP" src="https://img.shields.io/badge/Phase-1%20·%20MVP-16A34A?style=for-the-badge" />
  <img alt="Region us-east-2" src="https://img.shields.io/badge/Region-us--east--2-475569?style=for-the-badge" />
</p>

---

## Demo

A 28-second walkthrough of the live Playground: pick a scenario, run the full model lineup against it, and read the cost-vs-accuracy map, the ranked field, and the verdict banner.

<video src="https://github.com/cassidythilton/model-scenario-planner/raw/main/docs/media/llm-scenarios-screen.mp4" poster="docs/media/demo-poster.jpg" controls muted width="100%"></video>

> If the player does not load inline, [watch the demo directly](docs/media/llm-scenarios-screen.mp4) or open the [poster frame](docs/media/demo-poster.jpg).

[![LLM Scenario Comparison — live Playground](docs/media/demo-poster.jpg)](docs/media/llm-scenarios-screen.mp4)

---

## What it does

This is a **market-investigation tool**, not a one-off benchmark. It exists to produce defensible evidence for one decision: where the "cost pressure pushes demand toward cheaper models" thesis actually holds for real Domo-customer work, and where it collapses.

- **Two hypotheses under test.** *(H1, economic)* Cost pressure pushes demand toward secondary models. *(H2, technical)* With proper context and post-training, a secondary model reaches frontier-comparable accuracy on a given task. The harness produces the input to the H1 judgment and tests H2 directly.
- **Real tasks, not public benchmarks.** Scenarios are authored from anonymized sales-call transcripts (Gong), spanning task types from the easy-gap-closes end (extraction, classification) to the gap-persists end (multi-step reasoning, nuanced drafting).
- **Honest comparison by construction.** Any context / RAG / few-shot improvement built for a secondary model must be runnable **unchanged** against the frontier model. The comparison is configured-vs-configured, never rigged.

See [`llm-harness-scope-v0.1.md`](./llm-harness-scope-v0.1.md) and [`llm-harness-build-plan-v0.1.md`](./llm-harness-build-plan-v0.1.md) for the full scope and technical spec.

## Current status

Phase 1 (MVP) is live end-to-end on `domo.domo.com`: a scenario runs through Code Engine to Bedrock, results persist to AppDB, and the React reporting views render from real runs (no synthetic data).

| Capability | State |
|---|---|
| Custom app (5 views) | Live — design `6fe21b29…`, pinned in `app/manifest.json` |
| Bedrock broker (`runScenario`) | Live — Bearer-key auth, unified chat-completions path |
| Scorer (`scoreRun`) | Live — exact / label / structured-field F1 / reference-similarity |
| Model lineup | 8 models runnable via one adapter (see below) |
| Reporting | In-app (Recharts): cost-performance map, ranked field, run console |
| Cost ceiling | $300/mo hard cap, enforced server-side; staged scout → confirm |

## Architecture

```
[React custom app in Domo]  ──domo.post──>  [Code Engine functions]  ──HTTPS──>  [Amazon Bedrock]
   UI + orchestration only                    runScenario / scoreRun               Converse (runtime)
   (no AWS creds client-side)                  (holds the Bedrock API key)          + chat-completions (mantle)
        │                                                                            us-east-2
        └──read/write──> [AppDB collections]  <── scenarios, model configs, runs, evals, batches, scenario sets
```

- **Frontend** ([`app/`](./app)) — React + Vite + TypeScript custom app. UI and orchestration only; no AWS credentials in the browser. Reporting is in-app with Recharts (no Domo Cards, per build plan §0.6). Built as an IIFE bundle so it runs reliably inside Domo's custom-app iframe.
- **Backend** ([`codeengine/`](./codeengine)) — Two Domo Code Engine functions broker all Bedrock traffic. `runScenario` executes a single scenario × model-config; `scoreRun` grades output against the curated gold answer. Credentials are a Bedrock long-term API key (Bearer) injected at deploy time from a gitignored `key` file — never in the browser, never in git.
- **Storage** ([`appdb/`](./appdb)) — Six AppDB collections hold all app state, namespaced with the `llmharness_` prefix.

## Model lineup

The comparison unit is always **model × intervention**, never model alone. One normalized Code Engine contract routes each model through the right Bedrock path via an adapter, so adding a model is a config change, not a code change.

| Model | Role | Bedrock path |
|---|---|---|
| Claude Sonnet 4.6 | Frontier anchor | `runtime` (Converse) |
| Amazon Nova Pro | Secondary | `runtime` |
| Llama 3.3 70B | Secondary | `runtime` |
| DeepSeek V3.2 | Open weight | `mantle` (chat-completions) |
| Qwen3 235B | Open weight | `mantle` |
| Kimi K2.5 | Open weight | `mantle` |
| GLM 4.7 | Open weight | `mantle` |
| MiniMax M2.1 | Open weight | `mantle` |

> Model IDs and per-token prices change frequently. Pull both from the live Bedrock console when populating the registry rather than hardcoding.

## The app (five views)

| View | Purpose |
|---|---|
| **Playground** | Pick a scenario (or freeform prompt), select model configs, run side-by-side, and read output, score, cost, latency, and tokens. Doubles as the live-demo surface. |
| **Results map** | Cost-performance frontier per task type, gap-by-intervention, reliability (run-to-run variance), and pre-registration pass/fail. |
| **Scenarios** | Author, tag, import, and export scenarios; group them into reusable Scenario Sets. |
| **Models** | Register any Bedrock model × intervention; the symmetric-control rule keeps comparisons honest. |
| **Batches** | Expand a Scenario Set × model matrix into a run grid, get a pre-flight cost estimate, and execute staged (scout → confirm) runs with resumability. |

## Methodology (what makes results defensible)

1. **Symmetric control** — compare configured-vs-configured; never configured-secondary vs vanilla-frontier.
2. **Pre-registration** — fix and record the numeric "match" threshold and config budget per batch *before* running, to avoid endlessly re-tuning a losing model until it wins.
3. **Task-type segmentation** — never report a single blended accuracy number.
4. **N repeats** (default 3) at non-zero temperature — reliability is a first-class metric, not an afterthought.
5. **Held-out split** — tuning is not validated on the items it was tuned on.
6. **Own representative scenarios** over public benchmarks — avoids contamination and keeps relevance.

## Data model

Six AppDB collections (schema in [`appdb/collections.md`](./appdb/collections.md)):

| Collection | Holds |
|---|---|
| `llmharness_scenarios` | The unit of work — a task with a curated gold answer. |
| `llmharness_model_configs` | One row per model × intervention combination. |
| `llmharness_runs` | One model execution (supports N repeats). |
| `llmharness_evals` | Score(s) for a run, with scorer version for traceability. |
| `llmharness_batches` | A mass run; carries the pre-registration record. |
| `llmharness_scenario_sets` | Named, reusable collections of scenarios. |

## Repo layout

| Path | What |
|---|---|
| [`app/`](./app) | React custom app (frontend) — five views, Recharts reporting, Domo/AppDB wiring. |
| [`codeengine/bedrock-broker/`](./codeengine/bedrock-broker) | `runScenario` — the Bedrock-facing function + its contract. |
| [`codeengine/scorer/`](./codeengine/scorer) | `scoreRun` — gold-answer scoring (exact / label / structured-field / similarity). |
| [`appdb/`](./appdb) | AppDB collection schema definitions. |
| [`docs/`](./docs) | Decisions log, shaping notes, and the demo media. |
| [`docs/shaping/`](./docs/shaping) | Shape Up-style pitches and spikes (adapter, anonymization, slices). |
| [`llm-harness-scope-v0.1.md`](./llm-harness-scope-v0.1.md) | Scope and requirements (v0.1). |
| [`llm-harness-build-plan-v0.1.md`](./llm-harness-build-plan-v0.1.md) | Build plan and technical spec (v0.1). |

## Getting started

**Prerequisites:** Node 18+, a Domo instance with Code Engine and custom-app publishing, and Bedrock access in `us-east-2`.

```bash
# Frontend
cd app
npm install
npm run dev          # local dev against demo bootstrap data
npm run build        # IIFE bundle + manifest → app/dist (publish this to Domo)
```

**Backend (Code Engine).** Each function ships an `index.js` with a `__BEDROCK_API_KEY__` placeholder and a `build-payload.mjs` that injects the key at deploy time from a gitignored root `key` file. See [`codeengine/bedrock-broker/README.md`](./codeengine/bedrock-broker/README.md) for the full contract, input types, and smoke-test runbook. After deploy, wire the `packageId` and `version` into [`app/manifest.json`](./app/manifest.json).

## Cost controls

- **$300/month hard ceiling**, enforced server-side; estimated active spend ~$100–180/mo.
- **Staged execution:** a cheap wide *scout* pass (N=1, small sample) eliminates dominated configs before the deeper *confirm* pass (full set, N=3) spends real budget.
- **Pre-flight estimate** on every batch, with explicit confirmation to launch.
- **Dry-run mode** validates the run grid and cost estimate without invoking any model.
- Prompt caching on Claude/Nova for shared context; sane per-task `max_tokens`.

## Security and data handling

- **No AWS credentials in the browser.** The Bedrock API key lives only in the Code Engine function source (injected at deploy from the gitignored `key` file).
- **Anonymization before ingestion.** Real transcripts are scrubbed of PII with a stable token scheme (`[CUSTOMER]`, `[REP]`, `[COMPANY_A]`, …) *before* anything enters AppDB. Only the anonymized excerpt is stored or sent. The raw transcript never lands in the harness.
- No customer financial or identity data is ever entered into scenarios.
- `.gitignore` excludes all credential material (`key`, `*api-key*.csv`, `payload.json`, `*credentials*`, `.env*`). This repository has been scanned to confirm no secrets are committed.

## Roadmap

- **Phase 0 — Foundation** *(done):* Code Engine + adapter, AppDB collections, one-scenario smoke test.
- **Phase 1 — MVP** *(current):* full 8-model registry, scenario authoring + Gong anonymization, zero-shot / few-shot / RAG, eval engine, manual + batch modes, React reporting.
- **Phase 2 — Depth:** fine-tuning arms (Bedrock SFT; RFT on Nova as a near-direct H2 test), real RAG via Bedrock Knowledge Bases, human-eval review queue, multi-user sharing, scheduled drift re-runs.

See [`docs/decisions-log.md`](./docs/decisions-log.md) for the running decision record and open items.

## License

Internal Domo SE tooling. Not currently licensed for redistribution.
