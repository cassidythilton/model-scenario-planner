---
shaping: true
---

# V3 Plan — Batch engine + guardrails + cache

Implementation plan for slice **V3** in [`slices.md`](./slices.md). Goal: the "automate mass scenarios" core, done safely — expand a ScenarioSet × ModelConfig matrix into a run grid, execute it with cost guardrails, auto-score, persist, and support $0 demo replay.

## Scope (parts: B5, B6, B10 cache, N4, N8)

| # | Deliverable | File(s) |
|---|---|---|
| 1 | `Batch` type + `COST_CEILING_USD` + repos/bootstrap load | `types/harness.ts`, `lib/repos.ts`, `lib/bootstrap.ts` |
| 2 | Shared scoring extracted (used by playground + batch) | `lib/scoring.ts`, `components/PlaygroundPanel.tsx` |
| 3 | Batch engine: grid expansion, cost estimate, orchestrator | `lib/batch.ts` |
| 4 | Batch UI: builder, pre-registration, pre-flight, progress, history | `components/BatchRunner.tsx` |
| 5 | App wiring: batches state + handlers + **Batches** tab | `App.tsx`, `index.css` |

## Batch entity (matches `appdb/collections.md`)

`{ id, name, scenario_set_ids[], model_config_ids[], n_repeats, stage (scout|confirm), preregistered_thresholds{task→threshold}, cost_estimate, cost_actual, cost_ceiling, status (draft|running|paused|done|error), progress{total,completed,failed}, created_on }`

## Engine (`lib/batch.ts`)

- **`expandGrid(scenarios, models, nRepeats)`** → cells `{scenario, model, repeat_index}` (scenarios = union of the selected sets' members).
- **`estimateGrid(cells)`** → `{ runs, cost, tokens }` from a local token heuristic (instruction+context length / 4 in; task-based out) × per-model price. No model calls — this is the dry-run/pre-flight (scope §7.2).
- **`runBatch({cells, cacheMode, existingRuns, existingEvals, ceiling, onResult, onProgress, shouldStop})`**:
  - chunked concurrency (4); per cell builds a `RunConfig` + `config_hash`.
  - **cache/demo (B10):** if `cacheMode` and a prior ok run shares the `config_hash`, clone it (+ its eval) instead of calling Bedrock → $0 deterministic replay.
  - else `runScenario` (CE) → `evaluateRun` (CE scorer, local fallback).
  - **cost guard (N8):** accumulate `cost_actual`; stop when `>= ceiling`.
  - **resilience:** `throttled` → bounded exponential backoff retry; `shouldStop()` lets the UI pause/resume.
  - emits each `{run, eval}` via `onResult` (App persists + updates analytics) and progress via `onProgress`.

## Staging (B6)

`stage` is a label on the batch. **Scout** = N=1 wide; **Confirm** = N=3 on a hand-picked surviving subset (the user builds a confirm batch from scout winners). Auto-promotion between stages is deferred.

## Guardrails (R5.5 / N8)

Pre-flight estimate shown before launch; launch requires explicit confirm; `COST_CEILING_USD` default **$300** enforced as a hard stop during execution; cache mode for $0 demos.

## Exit criteria (demo)

Build a scout batch over a set × matrix, see the pre-flight estimate, confirm, watch progress auto-score + persist; toggle demo/cache mode and re-run instantly at $0; confirm the ceiling blocks an over-budget launch.

## Out of scope (later)

Auto scout→confirm promotion, analytics workspace (V4), narrative/memo (V5).
