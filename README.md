# LLM Market-Fit Investigation Harness

> **Cost-vs-accuracy evidence for the "cheaper model" thesis.** A Domo-hosted harness that runs real customer tasks against a frontier anchor and a fleet of secondary/open-weight models on Amazon Bedrock, then maps where the cheaper model closes the gap — and where it breaks down. The output is not a winner. It is a **map, segmented by task type.**

![version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)
![platform](https://img.shields.io/badge/platform-Domo_Custom_App-6236FF?style=flat-square)
![status](https://img.shields.io/badge/status-Phase_1_·_MVP_live-success?style=flat-square)
![react](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![recharts](https://img.shields.io/badge/Recharts-2-22B5A0?style=flat-square)
![bedrock](https://img.shields.io/badge/Amazon_Bedrock-us--east--2-FF9900?style=flat-square&logo=amazonaws&logoColor=white)
![codeengine](https://img.shields.io/badge/Backend-Domo_Code_Engine-1E293B?style=flat-square)
![appdb](https://img.shields.io/badge/State-Domo_AppDB-1E293B?style=flat-square)

---

## Table of Contents

1. [What Problem Does This Solve?](#what-problem-does-this-solve)
2. [Demo](#demo)
3. [Architecture](#architecture)
4. [Model Lineup](#model-lineup)
5. [The App — Five Views](#the-app--five-views)
   - [Playground](#playground)
   - [Results Map](#results-map)
   - [Scenarios](#scenarios)
   - [Models](#models)
   - [Batches](#batches)
6. [Methodology — Why the Results Are Defensible](#methodology--why-the-results-are-defensible)
7. [Data Model](#data-model)
8. [Cost Controls](#cost-controls)
9. [Security & Data Handling](#security--data-handling)
10. [Development & Deployment](#development--deployment)
11. [Project Structure](#project-structure)
12. [Roadmap](#roadmap)
13. [License](#license)

---

## What Problem Does This Solve?

The forecast that "cost pressure will push demand toward cheaper models" is only credible if you can show *where* a properly-configured secondary model actually reaches frontier-comparable accuracy on real work — and, just as important, where it does not. Blended benchmark numbers hide that boundary by averaging it away.

This harness is a **market-investigation tool**, not a one-off benchmark. It exists to answer one question with defensible evidence:

> For which kinds of real Domo-customer tasks does a properly-configured *secondary* (open-source / cheaper) model close the accuracy gap with a *frontier* model enough that the cost savings justify it — and where does that case break down?

It tests two hypotheses:

| Hypothesis | Statement | How this tool relates |
|---|---|---|
| ![h1](https://img.shields.io/badge/H1-Economic-6236FF?style=flat-square) | Cost pressure pushes demand toward secondary models. | Produces the *input* to that judgment, not the judgment itself. |
| ![h2](https://img.shields.io/badge/H2-Technical-FF6B35?style=flat-square) | With proper context + post-training, a secondary model reaches frontier-comparable accuracy on a given task. | Tested **directly**, task type by task type. |

Scenarios come from anonymized sales-call transcripts, deliberately chosen to span the easy-gap-closes end (extraction, classification) through the gap-persists end (multi-step reasoning, nuanced drafting), so the boundary shows up in the results instead of being averaged out.

---

## Demo

A 28-second walkthrough of the live Playground: pick a scenario, run the full model lineup against it, and read the cost-vs-accuracy map, the ranked field, and the verdict banner.

<p align="center">
  <a href="docs/media/llm-scenarios-screen.mp4">
    <img src="docs/media/demo-poster.jpg" alt="LLM Scenario Comparison — live Playground walkthrough" width="900" />
  </a>
</p>

<p align="center">
  <video src="https://github.com/cassidythilton/model-scenario-planner/raw/main/docs/media/llm-scenarios-screen.mp4" poster="docs/media/demo-poster.jpg" controls muted width="900"></video>
</p>

> If the player does not load inline, [watch the demo directly](docs/media/llm-scenarios-screen.mp4).

---

## Architecture

A **three-layer system**. The browser never touches AWS credentials; every model call is brokered server-side.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    EXPERIENCE LAYER (React custom app)                      │
│                                                                             │
│   Playground  │  Results Map  │  Scenarios  │  Models  │  Batches           │
│   UI + orchestration only · no AWS credentials client-side · Recharts       │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                         │  domo.post(...)
                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   BROKER LAYER (Domo Code Engine · JS)                       │
│                                                                             │
│   runScenario  ── one scenario × model-config → Bedrock, normalized result  │
│   scoreRun     ── grades output vs. curated gold answer                      │
│   Holds the Bedrock API key (Bearer) · injected at deploy, never in git      │
│                                                                             │
│   ┌── runtime  (Converse) ──────► Claude · Nova · Llama                       │
│   └── mantle   (chat-completions) ► DeepSeek · Qwen · Kimi · GLM · MiniMax    │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                         │  HTTPS · us-east-2
                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          Amazon Bedrock (us-east-2)                          │
└───────────────────────────────────────────────────────────────────────────┘

        ▲ read/write
        │
┌───────┴───────────────────────────────────────────────────────────────────┐
│                     PERSISTENCE LAYER (Domo AppDB)                           │
│   scenarios · model_configs · runs · evals · batches · scenario_sets         │
│   (namespaced llmharness_*)                                                  │
└───────────────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Core principle |
|---|---|---|
| ![exp](https://img.shields.io/badge/Experience-React_App-61DAFB?style=flat-square&logo=react&logoColor=white) | React 18 · TypeScript · Vite · Recharts | UI and orchestration only. No AWS credentials in the browser. Reporting is in-app (no Domo Cards). Built as an IIFE bundle so it runs reliably inside Domo's custom-app iframe. |
| ![broker](https://img.shields.io/badge/Broker-Code_Engine-6236FF?style=flat-square) | Domo Code Engine (JavaScript) | One normalized contract; an adapter routes each model to the right Bedrock path. The Bedrock API key lives only in the function source, injected at deploy time. |
| ![bedrock](https://img.shields.io/badge/Models-Amazon_Bedrock-FF9900?style=flat-square&logo=amazonaws&logoColor=white) | Bedrock Converse + chat-completions | A frontier anchor plus seven secondary/open-weight models behind a single interface. |
| ![appdb](https://img.shields.io/badge/State-Domo_AppDB-1E293B?style=flat-square) | Domo AppDB | Six collections hold all app state. Runs and evals are persisted for reproducibility. |

---

## Model Lineup

The comparison unit is always **model × intervention**, never model alone. One normalized Code Engine contract routes each model through the right Bedrock path, so adding a model is a config change, not a code change.

| Model | Role | Bedrock path |
|---|---|---|
| ![claude](https://img.shields.io/badge/Claude_Sonnet_4.6-191919?style=flat-square&logo=anthropic&logoColor=white) | Frontier anchor | `runtime` (Converse) |
| ![nova](https://img.shields.io/badge/Amazon_Nova_Pro-FF9900?style=flat-square&logo=amazonaws&logoColor=white) | Secondary | `runtime` |
| ![llama](https://img.shields.io/badge/Llama_3.3_70B-0467DF?style=flat-square&logo=meta&logoColor=white) | Secondary | `runtime` |
| ![deepseek](https://img.shields.io/badge/DeepSeek_V3.2-4D6BFE?style=flat-square) | Open weight | `mantle` (chat-completions) |
| ![qwen](https://img.shields.io/badge/Qwen3_235B-615CED?style=flat-square) | Open weight | `mantle` |
| ![kimi](https://img.shields.io/badge/Kimi_K2.5-000000?style=flat-square) | Open weight | `mantle` |
| ![glm](https://img.shields.io/badge/GLM_4.7-1E88E5?style=flat-square) | Open weight | `mantle` |
| ![minimax](https://img.shields.io/badge/MiniMax_M2.1-FF4E42?style=flat-square) | Open weight | `mantle` |

> Model IDs and per-token prices change frequently. Pull both from the live Bedrock console when populating the registry rather than hardcoding.

---

## The App — Five Views

### ![playground](https://img.shields.io/badge/01-Playground-56E39F?style=flat-square) Playground

Pick a scenario (or a freeform prompt), select any subset of the model lineup, and run a live comparison. The **accuracy-vs-cost map** plots every model (cheaper → left, more accurate → up), the **ranked field** orders them by accuracy with per-dollar "best value" callouts, and a **verdict banner** states plainly whether the cheaper-model case holds for this task. A live **run console** streams each call and score as it lands.

<p align="center">
  <img src="docs/media/playground.png" alt="Playground — accuracy-vs-cost map, ranked field, verdict banner, and live run console" width="900" />
</p>

Below the map, every model's full output renders **side-by-side** with its quality score, cost per task, latency, tokens, and the exact prompt sent — so a claim like "10.1× cheaper at −6.2 points" is always traceable back to the raw generation.

<p align="center">
  <img src="docs/media/playground-outputs.png" alt="Playground — side-by-side model outputs with quality, cost, latency, and tokens" width="900" />
</p>

### ![results](https://img.shields.io/badge/02-Results_Map-59C9A5?style=flat-square) Results Map

The analysis surface. It never reports a single blended accuracy number — everything is segmented by task type.

| Panel | What it answers |
|---|---|
| ![tradeoff](https://img.shields.io/badge/Per--task_tradeoff-5B6C5D?style=flat-square) | For each task type, which config wins on quality and which on lowest cost. |
| ![prereg](https://img.shields.io/badge/Pre--registration_verdict-5B6C5D?style=flat-square) | Did each config hit its *declared* threshold, per task type? Pass / fail grid. |
| ![gap](https://img.shields.io/badge/Gap--closing_by_intervention-5B6C5D?style=flat-square) | Does configuration (few-shot / RAG) narrow the secondary-vs-frontier gap? |

<p align="center">
  <img src="docs/media/results-frontier.png" alt="Results Map — per-task tradeoff cards, pre-registration verdict grid, and gap-closing by intervention" width="900" />
</p>

Reliability is treated as first-class, because run-to-run variance is half the story for smaller models: a **quality-per-dollar leaderboard**, a **consistency & speed** table (consistency %, p50/p95 latency, failure rate), a **hill-climb** of scored runs over time, and a **"what we'd test next"** panel that proposes the next sweep per task type.

<p align="center">
  <img src="docs/media/results-reliability.png" alt="Results Map — quality-per-dollar leaderboard, consistency and speed, hill-climb, and next-sweep suggestions" width="900" />
</p>

### ![scenarios](https://img.shields.io/badge/03-Scenarios-3B82F6?style=flat-square) Scenarios

The scenario library — the source of realism. Each card maps a recurring sales-call moment (sentiment read, objection ID, risk detection, competitor extraction, action items, MEDDIC qualification, grounded Q&A, call summary, email draft, agentic planning) to a **task type** and a **scorer**, with an anonymized input and a curated gold answer. Author, tag, import (JSON), and export (JSON / CSV); group scenarios into reusable **Scenario Sets**.

<p align="center">
  <img src="docs/media/scenarios.png" alt="Scenarios — sales-call archetype library spanning the easy-to-hard boundary" width="900" />
</p>

### ![models](https://img.shields.io/badge/04-Models-6236FF?style=flat-square) Models

The model × intervention registry, grouped by role (frontier anchor / secondary / open weight). Each config carries its resolved Bedrock model ID, path, intervention level, and per-1k pricing. The **symmetric-control rule** is enforced here: any few-shot / RAG config built for a secondary model must also exist, unchanged, for the frontier anchor — the UI makes the rigged comparison hard to do by accident.

<p align="center">
  <img src="docs/media/models.png" alt="Models — model-by-intervention registry grouped by role, with resolved IDs and pricing" width="900" />
</p>

### ![batches](https://img.shields.io/badge/05-Batches-8B5CF6?style=flat-square) Batches

Mass execution. Expand a Scenario Set × model matrix into a full run grid, get a **pre-flight cost estimate** that gates launch, and run in two stages — a cheap wide **scout** (N=1) to eliminate dominated configs, then a deeper **confirm** (N=3) for the survivors. A hard **$300 ceiling** stops runaway spend, a **demo / cache mode** replays prior runs at $0, and batch history tracks status, run counts, and actual cost.

<p align="center">
  <img src="docs/media/batches.png" alt="Batches — run-grid builder with pre-flight estimate, staged execution, and cost ceiling" width="900" />
</p>

---

## Methodology — Why the Results Are Defensible

| # | Guardrail | What it prevents |
|---|---|---|
| 1 | ![sym](https://img.shields.io/badge/Symmetric_control-56E39F?style=flat-square) Configured-vs-configured only | Never comparing a tuned secondary against a vanilla frontier. |
| 2 | ![prereg](https://img.shields.io/badge/Pre--registration-56E39F?style=flat-square) Fix the "match" threshold + config budget *before* running | Endlessly re-tuning a losing model until it "wins." |
| 3 | ![seg](https://img.shields.io/badge/Task--type_segmentation-56E39F?style=flat-square) Never a single blended number | Averaging away the boundary the study exists to find. |
| 4 | ![rep](https://img.shields.io/badge/N_repeats-56E39F?style=flat-square) Default N=3 at non-zero temperature | Treating a lucky single run as reliability. |
| 5 | ![holdout](https://img.shields.io/badge/Held--out_split-56E39F?style=flat-square) Tune and validate on different items | Validating tuning on the items it was tuned on. |
| 6 | ![own](https://img.shields.io/badge/Own_scenarios-56E39F?style=flat-square) Representative tasks over public benchmarks | Benchmark contamination and irrelevance. |

---

## Data Model

Six AppDB collections, namespaced with the `llmharness_` prefix. Full field-level schema in [`appdb/collections.md`](./appdb/collections.md).

| Collection | Holds |
|---|---|
| `llmharness_scenarios` | The unit of work — a task with a curated gold answer. |
| `llmharness_model_configs` | One row per model × intervention combination. |
| `llmharness_runs` | One model execution (supports N repeats), with the full resolved prompt for reproducibility. |
| `llmharness_evals` | Score(s) for a run, with `scorer_version` for traceability. |
| `llmharness_batches` | A mass run; carries the pre-registration record and progress for resumability. |
| `llmharness_scenario_sets` | Named, reusable collections of scenarios. |

Scoring dispatches on `scorer_type`: `exact` (normalized string equality), `structured_field` (per-field precision/recall/F1 vs. gold JSON), `label` (label match), and `reference_similarity` (embedding cosine vs. gold; below-threshold results are flagged `needs_human_review`).

---

## Cost Controls

- ![ceiling](https://img.shields.io/badge/$300/mo-hard_ceiling-FF6B35?style=flat-square) enforced server-side; estimated active spend ~$100–180/mo.
- **Staged execution** — a cheap wide *scout* pass eliminates dominated configs before the deeper *confirm* pass spends real budget.
- **Pre-flight estimate** on every batch (runs × est. tokens × per-model price), with explicit confirmation to launch.
- **Dry-run mode** validates the run grid and cost estimate without invoking any model.
- **Prompt caching** on Claude/Nova for shared context; sane per-task `max_tokens`.

---

## Security & Data Handling

- ![nocreds](https://img.shields.io/badge/No_AWS_creds-in_browser-success?style=flat-square) The Bedrock API key lives only in the Code Engine function source, injected at deploy from a gitignored `key` file — never in the browser, never in git.
- ![pii](https://img.shields.io/badge/PII-anonymized_before_ingestion-success?style=flat-square) Real transcripts are scrubbed with a stable token scheme (`[CUSTOMER]`, `[REP]`, `[COMPANY_A]`, …) *before* anything enters AppDB. Only the anonymized excerpt is stored or sent; the raw transcript never lands in the harness.
- No customer financial or identity data is ever entered into scenarios.
- `.gitignore` excludes all credential material (`key`, `*api-key*.csv`, `payload.json`, `*credentials*`, `.env*`). This repository has been scanned to confirm no secrets are committed.

---

## Development & Deployment

**Prerequisites:** Node 18+, a Domo instance with Code Engine and custom-app publishing, and Bedrock access in `us-east-2`.

```bash
# Frontend
cd app
npm install
npm run dev          # local dev against demo bootstrap data
npm run build        # IIFE bundle + manifest → app/dist (publish this to Domo)
```

**Backend (Code Engine).** Each function ships an `index.js` with a `__BEDROCK_API_KEY__` placeholder and a `build-payload.mjs` that injects the key at deploy time from a gitignored root `key` file. See [`codeengine/bedrock-broker/README.md`](./codeengine/bedrock-broker/README.md) for the full contract, input types, and smoke-test runbook. After deploy, wire the `packageId` and `version` into [`app/manifest.json`](./app/manifest.json).

---

## Project Structure

```
.
├── app/                          React + Vite + TS custom app (frontend)
│   ├── src/
│   │   ├── components/           Playground, ResultsMap, ScenarioLibrary, ModelRegistry, BatchRunner, …
│   │   ├── lib/                  bootstrap, domo/appdb wiring, scoring, metrics, batch orchestration
│   │   ├── data/                 seed scenarios + registry
│   │   ├── types/                harness domain types
│   │   └── App.tsx               five-view shell
│   └── manifest.json             Domo app id + collection/package mappings
├── codeengine/
│   ├── bedrock-broker/           runScenario — brokers all Bedrock traffic + contract
│   └── scorer/                   scoreRun — gold-answer scoring
├── appdb/
│   └── collections.md            AppDB collection schema definitions
├── docs/
│   ├── decisions-log.md          running decision record + open items
│   ├── shaping/                  Shape Up-style pitches and spikes
│   └── media/                    demo video + screenshots
├── llm-harness-scope-v0.1.md     scope & requirements
└── llm-harness-build-plan-v0.1.md build plan & technical spec
```

See [`llm-harness-scope-v0.1.md`](./llm-harness-scope-v0.1.md), [`llm-harness-build-plan-v0.1.md`](./llm-harness-build-plan-v0.1.md), and [`docs/decisions-log.md`](./docs/decisions-log.md) for full scope, spec, and the running decision record.

---

## Roadmap

| Phase | State | Scope |
|---|---|---|
| ![p0](https://img.shields.io/badge/Phase_0-Foundation-success?style=flat-square) | Done | Code Engine + adapter, AppDB collections, one-scenario smoke test. |
| ![p1](https://img.shields.io/badge/Phase_1-MVP-success?style=flat-square) | Current | Full 8-model registry, scenario authoring + anonymization, zero-shot / few-shot / RAG, eval engine, manual + batch modes, React reporting. |
| ![p2](https://img.shields.io/badge/Phase_2-Depth-lightgrey?style=flat-square) | Planned | Fine-tuning arms (Bedrock SFT; RFT on Nova as a near-direct H2 test), real RAG via Bedrock Knowledge Bases, human-eval review queue, multi-user sharing, scheduled drift re-runs. |

---

## License

Internal Domo SE tooling. Not currently licensed for redistribution.
