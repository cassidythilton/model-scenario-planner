/**
 * Bootstrap (Shape B, parts N1 + N9).
 *
 * Resolves the harness data on app start:
 *   1. Load scenarios + model configs + runs + evals + sets + batches from AppDB.
 *   2. Merge-seed: upsert any seed scenarios/configs whose id is MISSING (adds new
 *      seeds like the agentic scenarios without clobbering user edits).
 *   3. If AppDB is unreachable (e.g. running outside Domo) → render with the seed
 *      library and EMPTY runs/evals (no synthetic metrics).
 *
 * No synthetic runs/evals: every number shown comes from a real Bedrock run.
 */
import {
  loadScenarios,
  loadModelConfigs,
  loadRuns,
  loadEvals,
  loadScenarioSets,
  loadBatches,
  upsertById,
} from './repos';
import { seedScenarios, seedModelConfigs } from '../data/seed';
import type { Batch, HarnessEval, HarnessRun, ModelConfig, Scenario, ScenarioSet } from '../types/harness';

export interface HarnessData {
  scenarios: Scenario[];
  models: ModelConfig[];
  scenarioSets: ScenarioSet[];
  batches: Batch[];
  runs: HarnessRun[];
  evals: HarnessEval[];
  source: 'appdb' | 'demo';
}

export async function bootstrap(): Promise<HarnessData> {
  try {
    // A successful READ proves AppDB is reachable → 'appdb' mode (persistence on).
    let scenarios = await loadScenarios();
    let models = await loadModelConfigs();

    // Merge-seed any missing seed entries by id (handles first run AND later seed
    // additions). Best-effort: a write failure must not flip us to demo mode.
    const missingScn = seedScenarios.filter((s) => !scenarios.some((x) => x.id === s.id));
    const missingMdl = seedModelConfigs.filter((m) => !models.some((x) => x.id === m.id));
    if (missingScn.length || missingMdl.length) {
      try {
        await Promise.all([
          ...missingScn.map((s) => upsertById('scenarios', s)),
          ...missingMdl.map((m) => upsertById('modelConfigs', m)),
        ]);
      } catch {
        /* keep going */
      }
      scenarios = await loadScenarios();
      models = await loadModelConfigs();
    }

    // One-time content heals: overwrite a persisted scenario with the corrected
    // seed ONLY when its live value still matches a known-bad string. This fixes
    // shipped data without clobbering any user edit (an edited copy won't match).
    const SEED_HEALS: { id: string; staleInstruction: string }[] = [
      { id: 'scn_rag', staleInstruction: 'Answer using only the provided product context. If insufficient, say so.' },
    ];
    const heals = SEED_HEALS.filter((h) => {
      const live = scenarios.find((s) => s.id === h.id);
      return live && live.instruction === h.staleInstruction && seedScenarios.some((s) => s.id === h.id);
    });
    if (heals.length) {
      try {
        await Promise.all(heals.map((h) => upsertById('scenarios', seedScenarios.find((s) => s.id === h.id)!)));
        scenarios = await loadScenarios();
      } catch {
        /* keep going */
      }
    }

    const [runs, evals, scenarioSets, batches] = await Promise.all([
      loadRuns(), loadEvals(), loadScenarioSets(), loadBatches(),
    ]);

    // eslint-disable-next-line no-console
    console.log('[harness] AppDB mode', {
      scenarios: scenarios.length, models: models.length,
      scenarioSets: scenarioSets.length, runs: runs.length, batches: batches.length,
    });

    return {
      scenarios: scenarios.length ? scenarios : seedScenarios,
      models: models.length ? models : seedModelConfigs,
      scenarioSets,
      batches,
      runs,
      evals,
      source: 'appdb',
    };
  } catch (err) {
    // AppDB unreachable (likely running outside Domo) — render the seed library
    // with NO runs/evals (no synthetic metrics).
    // eslint-disable-next-line no-console
    console.error('[harness] DEMO fallback — AppDB read failed:', err);
    return {
      scenarios: seedScenarios,
      models: seedModelConfigs,
      scenarioSets: [],
      batches: [],
      runs: [],
      evals: [],
      source: 'demo',
    };
  }
}
