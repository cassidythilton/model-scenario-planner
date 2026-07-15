---
shaping: true
---

# V2 Plan — Authoring, sets & registry

Implementation plan for slice **V2** in [`slices.md`](./slices.md). Goal: make the library and registry real and editable — including the intervention ladder and the anonymization discipline.

## Scope (parts: B3 synthetic/S2-B, B1+, B2 registry admin, R1.2, R1.4)

| # | Deliverable | File(s) |
|---|---|---|
| 1 | `ScenarioSet` type + repos (load/save/delete) + bootstrap load | `types/harness.ts`, `lib/repos.ts`, `lib/domo.ts`, `lib/bootstrap.ts` |
| 2 | Editable app state + mutation handlers; new **Models** tab | `App.tsx` |
| 3 | Scenario authoring (create/edit) with **anonymization notice** (S2-B), `split`/`source_ref` | `components/Modal.tsx`, `components/ScenarioEditor.tsx`, `components/ScenarioLibrary.tsx` |
| 4 | ScenarioSet builder | `components/ScenarioLibrary.tsx` (Sets panel) |
| 5 | Model registry admin + **symmetric-control guard** (R1.4) | `components/ModelRegistry.tsx`, `lib/symmetric.ts` |
| 6 | JSON import/export + CSV export | `lib/io.ts` |

## Key rules

- **Anonymization (S2-B):** the scenario form has **no raw-transcript field**. `input_context` accepts only already-anonymized text; the form shows the manual-redaction requirement + token scheme (`[CUSTOMER]`, `[REP]`, `[COMPANY_A]`, `[EMAIL]`, `[$AMOUNT]`). `source = anonymized_real` requires a `source_ref` (anonymized handle).
- **Symmetric control (R1.4):** saving a non-`zeroshot` config for a non-frontier model is blocked unless a frontier-anchor config with the **same intervention_level** exists. The registry offers a one-click "create the matching anchor config."
- **Held-out split:** `split` (`train` | `holdout`) captured per scenario; honored by tuning/batch flows in V3.

## Persistence

All mutations go through `upsertById(alias, entity)` (persist when `source === 'appdb'`, else state-only). `App` holds `scenarios`, `models`, `scenarioSets` as state and updates both memory + AppDB.

## Exit criteria (demo)

Author a scenario from an anonymized excerpt, tag it, add it to a set; create a "DeepSeek — few-shot" config and watch the UI require a matching "Sonnet — few-shot"; run the new scenario+config in the playground.

## Out of scope (later)

Batch runner (V3), analytics (V4), automated anonymization S2-A, CSV import (JSON import only in V2).
