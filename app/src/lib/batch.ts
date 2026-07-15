/**
 * Batch engine (Shape B, parts B5/B6/B10/N4/N8).
 * Expands a ScenarioSet × ModelConfig matrix into a run grid, estimates cost
 * (dry-run), and executes with cost guardrails, cache/demo replay, and retry.
 */
import { runScenario } from './domo';
import { buildRunConfig, hashRunConfig } from './runConfig';
import { evaluateRun } from './scoring';
import { BEDROCK_ACCOUNT_REF } from '../types/harness';
import type {
  HarnessEval,
  HarnessRun,
  ModelConfig,
  Scenario,
  ScenarioSet,
  TaskType,
} from '../types/harness';

export interface BatchCell {
  scenario: Scenario;
  model: ModelConfig;
  repeat_index: number;
}

// Rough per-task output-token expectation for the pre-flight estimate.
const OUTPUT_EST: Record<TaskType, number> = {
  classification: 8,
  extraction: 40,
  structured_output: 120,
  rag_qa: 120,
  summarization: 140,
  reasoning_multistep: 260,
  agentic: 300,
};

/** Union of scenarios across the selected sets (deduped, order-stable). */
export function scenariosForSets(
  setIds: string[],
  sets: ScenarioSet[],
  scenarios: Scenario[]
): Scenario[] {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const set of sets) {
    if (setIds.includes(set.id)) set.scenario_ids.forEach((id) => ids.add(id));
  }
  return [...ids].map((id) => byId.get(id)).filter(Boolean) as Scenario[];
}

export function expandGrid(scenarios: Scenario[], models: ModelConfig[], nRepeats: number): BatchCell[] {
  const cells: BatchCell[] = [];
  for (const scenario of scenarios) {
    for (const model of models) {
      for (let r = 0; r < nRepeats; r++) cells.push({ scenario, model, repeat_index: r });
    }
  }
  return cells;
}

export interface GridEstimate {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export function estimateGrid(cells: BatchCell[]): GridEstimate {
  let inputTokens = 0, outputTokens = 0, cost = 0;
  for (const { scenario, model } of cells) {
    const inTok = Math.ceil(((scenario.instruction || '') + (scenario.input_context || '')).length / 4) + 12;
    const outTok = Math.min(model.params.max_tokens || 512, OUTPUT_EST[scenario.task_type] ?? 120);
    inputTokens += inTok;
    outputTokens += outTok;
    cost += (inTok / 1000) * model.price_per_1k_input + (outTok / 1000) * model.price_per_1k_output;
  }
  return { runs: cells.length, inputTokens, outputTokens, cost };
}

const genId = (cell: BatchCell, batchId: string) =>
  `run_${batchId}_${cell.scenario.id}_${cell.model.id}_${cell.repeat_index}_${Math.random().toString(36).slice(2, 7)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunBatchOpts {
  batchId: string;
  cells: BatchCell[];
  cacheMode: boolean;
  existingRuns: HarnessRun[];
  existingEvals: HarnessEval[];
  ceiling: number;
  concurrency?: number;
  onResult: (r: { run: HarnessRun; eval: HarnessEval }) => void;
  onProgress: (p: { completed: number; failed: number; total: number; cost: number }) => void;
  shouldStop: () => boolean;
}

export interface RunBatchResult {
  completed: number;
  failed: number;
  cost: number;
  stoppedReason: 'done' | 'ceiling' | 'stopped';
}

export async function runBatch(opts: RunBatchOpts): Promise<RunBatchResult> {
  const { batchId, cells, cacheMode, existingRuns, existingEvals, ceiling, onResult, onProgress, shouldStop } = opts;
  const concurrency = opts.concurrency ?? 4;
  let completed = 0, failed = 0, cost = 0;
  let stoppedReason: RunBatchResult['stoppedReason'] = 'done';

  const evalByRun = new Map(existingEvals.map((e) => [e.run_id, e]));

  const runCell = async (cell: BatchCell) => {
    const rc = buildRunConfig(cell.scenario, cell.model, cell.repeat_index);
    const hash = hashRunConfig(rc);

    // Cache / demo replay (B10).
    if (cacheMode) {
      const cached = existingRuns.find(
        (r) => r.config_hash === hash && r.scenario_id === cell.scenario.id && r.status === 'ok'
      );
      if (cached) {
        const run: HarnessRun = { ...cached, id: genId(cell, batchId), batch_id: batchId, repeat_index: cell.repeat_index, config_hash: hash, is_demo: true };
        const cachedEval = evalByRun.get(cached.id);
        const evaluation: HarnessEval = cachedEval
          ? { ...cachedEval, id: `eval_${run.id}`, run_id: run.id }
          : await evaluateRun(cell.scenario, run);
        return { run, eval: evaluation };
      }
    }

    // Live execution with bounded backoff on throttling.
    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await runScenario({
        scenario: {
          id: cell.scenario.id,
          task_type: cell.scenario.task_type,
          instruction: cell.scenario.instruction,
          input_context: cell.scenario.input_context,
        },
        modelConfig: {
          bedrock_model_id: cell.model.bedrock_model_id,
          path: cell.model.path,
          endpoint: cell.model.endpoint ?? cell.model.path,
          intervention: cell.model.intervention_level,
          params: cell.model.params,
          fewshot_examples: cell.model.fewshot_examples,
          account_ref: BEDROCK_ACCOUNT_REF,
          price_per_1k_input: cell.model.price_per_1k_input,
          price_per_1k_output: cell.model.price_per_1k_output,
        },
        repeatIndex: cell.repeat_index,
        dryRun: false,
      });
      if (res.status !== 'throttled') break;
      await sleep(500 * 2 ** attempt);
    }

    const run: HarnessRun = {
      id: genId(cell, batchId),
      scenario_id: cell.scenario.id,
      model_config_id: cell.model.id,
      batch_id: batchId,
      repeat_index: cell.repeat_index,
      status: res?.status ?? 'error',
      output_text: res?.run?.output_text,
      resolved_prompt: res?.run?.resolved_prompt,
      model_id_resolved: res?.run?.model_id_resolved,
      input_tokens: res?.run?.input_tokens,
      output_tokens: res?.run?.output_tokens,
      latency_ms: res?.run?.latency_ms,
      cost_usd: res?.run?.cost_usd,
      config_hash: hash,
      request_id: res?.run?.request_id ?? null,
      timestamp: res?.run?.timestamp ?? new Date().toISOString(),
      error: res?.error ?? null,
    };
    const evaluation = await evaluateRun(cell.scenario, run);
    return { run, eval: evaluation };
  };

  for (let i = 0; i < cells.length; i += concurrency) {
    if (shouldStop()) { stoppedReason = 'stopped'; break; }
    if (cost >= ceiling) { stoppedReason = 'ceiling'; break; }
    const chunk = cells.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(runCell));
    for (const r of results) {
      cost += r.run.cost_usd ?? 0;
      if (r.run.status === 'ok') completed += 1; else failed += 1;
      onResult(r);
    }
    onProgress({ completed, failed, total: cells.length, cost });
  }

  return { completed, failed, cost, stoppedReason };
}
