---
shaping: true
---

# V4 Plan — Analytics workspace

Implementation plan for slice **V4** in [`slices.md`](./slices.md). Goal: turn persisted runs into the defensible map — segmented, interactive, with drill-down.

## Scope (parts: B7, N6)

| # | Deliverable | File(s) |
|---|---|---|
| 1 | Metrics helpers: per-task pass/fail vs threshold, gap-by-intervention | `lib/metrics.ts` |
| 2 | Interactive **Pareto scatter** (Recharts), per-task filter, clickable points | `components/ResultsMap.tsx` |
| 3 | **Pre-registration pass/fail matrix** (config × task type vs threshold) | `components/ResultsMap.tsx` |
| 4 | **Gap-closing-by-intervention** panel | `components/ResultsMap.tsx` |
| 5 | **Run drill-down** modal (output vs gold + score breakdown) | `components/ResultsMap.tsx` + `Modal` |

## What's retained from V1's map

Heroes, gap-by-task bars, quality-per-dollar leaderboard, reliability, recent-runs — all kept. The SVG frontier is replaced by an interactive Recharts scatter (tooltips + click-to-drill).

## Notes

- Pre-registered thresholds use `TASK_THRESHOLDS` (the registered defaults). Batch-level pre-registration overrides live on the Batch record; the matrix shows pass/fail of each config's per-task avg vs the registered threshold (R6.4).
- Per-task Pareto: a task selector switches the scatter's y to that task's avg score (x stays cost/task). "All" uses overall avg score.
- Drill-down: click a scatter point / leaderboard / reliability row → modal lists that config's runs with scenario, model output vs gold, score + breakdown, status.

## Exit criteria (demo)

Open Analytics after a batch; read the cost-vs-accuracy Pareto per task type; see the pre-registration pass/fail matrix; drill into a config to read actual outputs vs gold.

## Out of scope (later)

Cross-task small-multiples Compare tab and narrative/memo (V5).
