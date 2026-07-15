import { FRONTIER_CONFIG_ID } from '../data/demoHarness';
import type {
  HarnessEval,
  HarnessRun,
  ModelConfig,
  ModelMetrics,
  Scenario,
  TaskType,
} from '../types/harness';
import { TASK_THRESHOLDS } from '../types/harness';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

const WIN_EPSILON = 0.01;

export interface MetricsContext {
  metrics: ModelMetrics[];
  frontierScore: number;
  frontierCost: number;
  byId: Map<string, ModelMetrics>;
}

/**
 * Compute decision-grade metrics per model config from runs + evals.
 * The frontier anchor (FRONTIER_CONFIG_ID) defines the gap baseline.
 */
export function computeMetrics(
  configs: ModelConfig[],
  scenarios: Scenario[],
  runs: HarnessRun[],
  evals: HarnessEval[]
): MetricsContext {
  const evalByRun = new Map(evals.map((e) => [e.run_id, e]));
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

  // Frontier per-scenario average score (for win-rate + gap).
  const frontierScoreByScenario = new Map<string, number>();
  for (const scn of scenarios) {
    const fevals = evals.filter(
      (e) => e.model_config_id === FRONTIER_CONFIG_ID && e.scenario_id === scn.id
    );
    if (fevals.length) frontierScoreByScenario.set(scn.id, mean(fevals.map((e) => e.score)));
  }

  const frontierConfig = configs.find((c) => c.id === FRONTIER_CONFIG_ID);
  const frontierAllScores = evals
    .filter((e) => e.model_config_id === FRONTIER_CONFIG_ID)
    .map((e) => e.score);
  const frontierScore = mean(frontierAllScores);
  const frontierRuns = runs.filter((r) => r.model_config_id === FRONTIER_CONFIG_ID && r.status === 'ok');
  const frontierCost = mean(frontierRuns.map((r) => r.cost_usd ?? 0));

  const metrics: ModelMetrics[] = configs.map((config) => {
    const cfgRuns = runs.filter((r) => r.model_config_id === config.id);
    const okRuns = cfgRuns.filter((r) => r.status === 'ok');
    const cfgEvals = okRuns.map((r) => evalByRun.get(r.id)).filter(Boolean) as HarnessEval[];

    const scores = cfgEvals.map((e) => e.score);
    const avgScore = mean(scores);

    // Reliability: average within-scenario stdev across repeats -> consistency.
    const perScenarioStdevs: number[] = [];
    const scenarioIds = new Set(cfgEvals.map((e) => e.scenario_id));
    let wins = 0;
    let scenariosScored = 0;
    let passes = 0;
    const perTask: Record<string, { sum: number; count: number }> = {};

    scenarioIds.forEach((sid) => {
      const sEvals = cfgEvals.filter((e) => e.scenario_id === sid);
      const sScores = sEvals.map((e) => e.score);
      perScenarioStdevs.push(stdev(sScores));
      const sAvg = mean(sScores);
      scenariosScored += 1;

      const scn = scenarioById.get(sid);
      if (scn) {
        const t = scn.task_type;
        if (!perTask[t]) perTask[t] = { sum: 0, count: 0 };
        perTask[t].sum += sAvg;
        perTask[t].count += 1;
        if (sAvg >= TASK_THRESHOLDS[t]) passes += 1;
      }

      const fScore = frontierScoreByScenario.get(sid);
      if (fScore != null && sAvg >= fScore - WIN_EPSILON) wins += 1;
    });

    const scoreStdev = mean(perScenarioStdevs);
    const consistency = Math.max(0, Math.min(1, 1 - scoreStdev / 0.08));

    const avgCost = mean(okRuns.map((r) => r.cost_usd ?? 0));
    const latencies = okRuns.map((r) => r.latency_ms ?? 0);
    const throughput = mean(
      okRuns
        .filter((r) => (r.latency_ms ?? 0) > 0)
        .map((r) => (r.output_tokens ?? 0) / ((r.latency_ms ?? 1) / 1000))
    );

    const qualityPerDollar = avgCost > 0 ? avgScore / avgCost : 0;
    const gapToFrontier = frontierScore - avgScore;
    const passRate = scenariosScored ? passes / scenariosScored : 0;
    const winRate = scenariosScored ? wins / scenariosScored : 0;

    const matched = config.id !== FRONTIER_CONFIG_ID && gapToFrontier <= 0.03;
    const savingsAtParity =
      matched && frontierCost > 0 ? Math.max(0, (frontierCost - avgCost) / frontierCost) : null;

    const perTaskOut = {} as ModelMetrics['perTask'];
    (Object.keys(perTask) as TaskType[]).forEach((t) => {
      const avg = perTask[t].sum / perTask[t].count;
      const fScores = evals.filter(
        (e) => e.model_config_id === FRONTIER_CONFIG_ID && scenarioById.get(e.scenario_id)?.task_type === t
      );
      const fAvg = mean(fScores.map((e) => e.score));
      perTaskOut[t] = { avgScore: avg, gap: fAvg - avg, count: perTask[t].count };
    });

    return {
      config,
      runs: cfgRuns.length,
      okRuns: okRuns.length,
      failureRate: cfgRuns.length ? (cfgRuns.length - okRuns.length) / cfgRuns.length : 0,
      avgScore,
      consistency,
      scoreStdev,
      avgCost,
      avgLatencyP50: percentile(latencies, 50),
      avgLatencyP95: percentile(latencies, 95),
      throughput,
      qualityPerDollar,
      gapToFrontier: config.id === FRONTIER_CONFIG_ID ? 0 : gapToFrontier,
      passRate,
      winRate,
      savingsAtParity,
      perTask: perTaskOut,
    };
  });

  void frontierConfig;
  return {
    metrics,
    frontierScore,
    frontierCost,
    byId: new Map(metrics.map((m) => [m.config.id, m])),
  };
}

/** Gap-closing by intervention level: avg secondary gap-to-frontier per lever.
 *  Shows whether context (few-shot/RAG) narrows the gap as configs accrue. */
export function gapByIntervention(ctx: MetricsContext): { intervention: string; avgGap: number; count: number }[] {
  const groups: Record<string, number[]> = {};
  for (const m of ctx.metrics) {
    if (m.config.id === FRONTIER_CONFIG_ID || m.okRuns === 0) continue;
    (groups[m.config.intervention_level] ||= []).push(m.gapToFrontier);
  }
  return Object.entries(groups).map(([intervention, gaps]) => ({
    intervention,
    avgGap: mean(gaps),
    count: gaps.length,
  }));
}

/* ---------- formatters ---------- */
export const fmtPct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const fmtScore = (v: number) => `${Math.round(v * 100)}`;
export const fmtCost = (v: number) => {
  if (v === 0) return '$0';
  if (v < 0.001) return `$${(v * 1000).toFixed(3)}m`; // sub-milli -> millicents style
  return `$${v.toFixed(4)}`;
};
export const fmtCostFull = (v: number) => `$${v.toFixed(6)}`;
export const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);
export const fmtDelta = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}`;
export const fmtMultiple = (v: number) => (v >= 1 ? `${v.toFixed(1)}x` : `${v.toFixed(2)}x`);
