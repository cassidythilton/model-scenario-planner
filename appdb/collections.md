# AppDB Collections

The harness persists all app state in AppDB. One collection per entity (scope §4). Collections are namespaced with the `llmharness_` prefix to avoid colliding with anything else in `domo.domo.com`.

Each AppDB document has the shape `{ "id": "<uuid>", "content": { ...fields below... } }`. The fields documented here live under `content`.

| Collection | Purpose |
|---|---|
| `llmharness_scenarios` | The unit of work — a task with a curated gold answer. |
| `llmharness_model_configs` | One row per model × intervention combination. |
| `llmharness_runs` | One model execution (supports N repeats). |
| `llmharness_evals` | Score(s) for a run. |
| `llmharness_batches` | A mass run; carries the pre-registration record. |
| `llmharness_scenario_sets` | Named, reusable collections of scenarios. |

## llmharness_scenarios

| Field | Type | Notes |
|---|---|---|
| `title` | text | Human label. |
| `task_type` | text | `extraction` \| `classification` \| `structured_output` \| `rag_qa` \| `summarization` \| `reasoning_multistep` \| `agentic` |
| `instruction` | text | The task prompt (what the model must do). |
| `input_context` | text | Optional anonymized input (e.g. transcript excerpt). |
| `gold_answer` | object/text | Curated reference answer; shape depends on `scorer_type`. |
| `scorer_type` | text | `exact` \| `structured_field` \| `label` \| `reference_similarity` |
| `source` | text | `synthetic` \| `anonymized_real` |
| `source_ref` | text | Anonymized handle only (e.g. `gong_call_anon_0142`). Never raw. |
| `tags` | list[text] | Free-form tags (e.g. `renewal`, `multistakeholder`, `multilingual`). |
| `split` | text | `train` \| `holdout` — for held-out validation (methodology §6.5). |
| `created_on` | datetime | |

## llmharness_model_configs

The comparison unit is **model × intervention**, never model alone.

| Field | Type | Notes |
|---|---|---|
| `label` | text | e.g. "DeepSeek V3.2 — few-shot". |
| `bedrock_model_id` | text | e.g. `anthropic.claude-3-5-sonnet-...` or inference-profile id. |
| `path` | text | `runtime` (Converse) \| `mantle` (chat-completions). |
| `intervention_level` | text | `zeroshot` \| `fewshot` \| `rag` \| `finetuned` |
| `params` | object | `{ temperature, max_tokens, ... }` |
| `fewshot_examples` | list[object] | Used when intervention = `fewshot`. |
| `context_strategy_ref` | text | Optional ref to a shared RAG/context strategy. |
| `supports_prompt_cache` | boolean | Claude/Nova caching. |
| `price_per_1k_input` | decimal | From live Bedrock pricing. |
| `price_per_1k_output` | decimal | From live Bedrock pricing. |

> **Symmetric-control rule (scope §5.2):** any context/RAG/few-shot config built for a secondary model must be runnable unchanged against the frontier model. Enforced in the authoring UI in Phase 1.

## llmharness_runs

| Field | Type | Notes |
|---|---|---|
| `scenario_id` | text | FK → scenario. |
| `model_config_id` | text | FK → model config. |
| `batch_id` | text | FK → batch (null for manual runs). |
| `repeat_index` | number | N-repeats for variance. |
| `output_text` | text | Model output. |
| `resolved_prompt` | text | Full prompt sent (reproducibility §7.3). |
| `model_id_resolved` | text | Actual model/profile id used. |
| `input_tokens` | number | |
| `output_tokens` | number | |
| `latency_ms` | number | |
| `cost_usd` | decimal | |
| `status` | text | `ok` \| `error` \| `throttled` \| `dry_run` |
| `error` | text | Null when ok. |
| `timestamp` | datetime | |

## llmharness_evals

| Field | Type | Notes |
|---|---|---|
| `run_id` | text | FK → run. |
| `score` | decimal | 0–1 (or task-specific). |
| `score_breakdown` | object | e.g. per-field precision/recall/F1. |
| `scorer_type` | text | Mirrors the scenario's `scorer_type`. |
| `scorer_version` | text | Traceability (§7.3). |
| `needs_human_review` | boolean | True when below similarity threshold. |
| `human_verdict` | text | Filled by review queue (Phase 2). |

## llmharness_batches

| Field | Type | Notes |
|---|---|---|
| `name` | text | |
| `scenario_set_ids` | list[text] | |
| `model_config_ids` | list[text] | |
| `n_repeats` | number | Default 3. |
| `stage` | text | `scout` \| `confirm` (cost strategy §3). |
| `preregistered_thresholds` | object | Per-task-type "match" threshold + config budget (§6.2). |
| `cost_estimate` | decimal | Pre-flight. |
| `cost_actual` | decimal | Rolled up on completion. |
| `cost_ceiling` | decimal | Hard stop. |
| `status` | text | `draft` \| `estimating` \| `running` \| `paused` \| `done` \| `error` |
| `progress` | object | `{ total, completed, failed }` for resumability. |

## llmharness_scenario_sets

| Field | Type | Notes |
|---|---|---|
| `name` | text | |
| `scenario_ids` | list[text] | |
| `description` | text | |
