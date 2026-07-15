export type TaskType =
  | 'classification'
  | 'extraction'
  | 'structured_output'
  | 'rag_qa'
  | 'summarization'
  | 'reasoning_multistep'
  | 'agentic';

export type ScorerType = 'exact' | 'label' | 'structured_field' | 'reference_similarity';

export type InterventionLevel = 'zeroshot' | 'fewshot' | 'rag' | 'finetuned';

/** Bedrock endpoint family — `runtime` = bedrock-runtime, `mantle` = bedrock-mantle.
 *  Reconciled with AppDB `path` field (same meaning). */
export type ModelPath = 'runtime' | 'mantle';

export type ModelTier = 'frontier' | 'secondary' | 'open_weight';

export type Difficulty = 1 | 2 | 3;

export interface Scenario {
  id: string;
  title: string;
  archetype: string;
  task_type: TaskType;
  difficulty: Difficulty;
  instruction: string;
  input_context: string;
  gold_answer: string;
  scorer_type: ScorerType;
  source: 'synthetic' | 'anonymized_real';
  /** Anonymized handle only (e.g. `gong_call_anon_0142`). Never raw text. */
  source_ref?: string;
  /** Held-out validation split (methodology §6.5). */
  split?: 'train' | 'holdout';
  tags: string[];
}

export interface FewshotExample {
  input: string;
  output: string;
}

export interface ModelConfig {
  id: string;
  label: string;
  short_label: string;
  vendor: string;
  bedrock_model_id: string;
  /** Bedrock endpoint family; `path` is the AppDB field name, `endpoint` is its alias. */
  path: ModelPath;
  endpoint?: ModelPath;
  tier: ModelTier;
  intervention_level: InterventionLevel;
  params: { temperature: number; max_tokens: number };
  fewshot_examples?: FewshotExample[];
  context_strategy_ref?: string;
  supports_prompt_cache?: boolean;
  price_per_1k_input: number;
  price_per_1k_output: number;
  runnable: boolean;
  status: 'ready' | 'needs_profile' | 'seeded';
  note?: string;
}

export interface HarnessRun {
  id: string;
  scenario_id: string;
  model_config_id: string;
  batch_id?: string | null;
  repeat_index: number;
  status: 'ok' | 'error' | 'throttled' | 'dry_run';
  output_text?: string;
  resolved_prompt?: string;
  model_id_resolved?: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  cost_usd?: number;
  /** Hashable RunConfig fingerprint (B9) — reproducibility + cache replay. */
  config_hash?: string;
  /** Bedrock request id (`x-amzn-requestid`) for AWS-side reconciliation. */
  request_id?: string | null;
  timestamp: string;
  error?: string | null;
  is_demo?: boolean;
}

export interface HarnessEval {
  id: string;
  run_id: string;
  scenario_id: string;
  model_config_id: string;
  task_type: TaskType;
  score: number;
  threshold: number;
  needs_human_review: boolean;
  scorer_type: ScorerType;
  /** Per-field precision/recall/F1 etc. (structured_field). */
  score_breakdown?: Record<string, unknown>;
  scorer_version?: string;
}

export interface ScenarioSet {
  id: string;
  name: string;
  scenario_ids: string[];
  description?: string;
}

export type BatchStage = 'scout' | 'confirm';
export type BatchStatus = 'draft' | 'running' | 'paused' | 'done' | 'error';

export interface Batch {
  id: string;
  name: string;
  scenario_set_ids: string[];
  model_config_ids: string[];
  n_repeats: number;
  stage: BatchStage;
  preregistered_thresholds: Partial<Record<TaskType, number>>;
  cache_mode: boolean;
  cost_estimate: number;
  cost_actual: number;
  cost_ceiling: number;
  status: BatchStatus;
  progress: { total: number; completed: number; failed: number };
  created_on: string;
}

/** Default monthly Bedrock spend ceiling, enforced per batch (decision O5). */
export const COST_CEILING_USD = 300;

/** Reference used by the CE functions to resolve the Bedrock Domo account via
 *  codeengine.getAccount(ref) — no Account input/wiring needed. Override if the
 *  Domo account's name/id differs from the provider type. */
export const BEDROCK_ACCOUNT_REF = '15170';

export interface SessionRunResult {
  run: HarnessRun;
  eval: HarnessEval;
}

/** Per task-type pre-registered "match" threshold (methodology guardrail). */
export const TASK_THRESHOLDS: Record<TaskType, number> = {
  classification: 0.95,
  extraction: 0.92,
  structured_output: 0.9,
  rag_qa: 0.88,
  summarization: 0.85,
  reasoning_multistep: 0.82,
  agentic: 0.8,
};

export const TASK_LABELS: Record<TaskType, string> = {
  classification: 'Classification',
  extraction: 'Extraction',
  structured_output: 'Structured output',
  rag_qa: 'RAG Q&A',
  summarization: 'Summarization',
  reasoning_multistep: 'Reasoning',
  agentic: 'Agentic',
};

export const TIER_LABELS: Record<ModelTier, string> = {
  frontier: 'Frontier anchor',
  secondary: 'Secondary',
  open_weight: 'Open weight',
};

/** Aggregated, decision-grade metrics for one model config. */
export interface ModelMetrics {
  config: ModelConfig;
  runs: number;
  okRuns: number;
  failureRate: number;
  avgScore: number;
  consistency: number; // 1 - normalized stdev of score across repeats
  scoreStdev: number;
  avgCost: number;
  avgLatencyP50: number;
  avgLatencyP95: number;
  throughput: number; // output tokens / sec
  qualityPerDollar: number; // score points per $ (scaled)
  gapToFrontier: number; // frontier avg score - this avg score
  passRate: number; // fraction of scenarios meeting pre-registered threshold
  winRate: number; // fraction of scenarios where score >= frontier - epsilon
  savingsAtParity: number | null; // cost reduction vs frontier when matched, else null
  perTask: Record<TaskType, { avgScore: number; gap: number; count: number } | undefined>;
}
