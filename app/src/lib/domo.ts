/**
 * Thin wrappers over ryuu.js (domo.js) for the harness:
 *  - AppDB CRUD per collection alias (see app/manifest.json collectionsMapping)
 *  - Code Engine invocation for the Bedrock broker
 *
 * The app holds no AWS credentials. All Bedrock traffic goes through the
 * `runScenario` Code Engine function, which reads creds from a mapped Domo Account.
 */
import domo from 'ryuu.js';

export type CollectionAlias =
  | 'scenarios'
  | 'modelConfigs'
  | 'runs'
  | 'evals'
  | 'batches'
  | 'scenarioSets';

// The Domo AppDB runtime resolves collections by their actual NAME, not the
// manifest alias. Using the alias in the path 404s. Map alias → real collection
// name (the `llmharness_*` collections that exist in the app's datastore).
const COLLECTION_NAME: Record<CollectionAlias, string> = {
  scenarios: 'llmharness_scenarios',
  modelConfigs: 'llmharness_model_configs',
  runs: 'llmharness_runs',
  evals: 'llmharness_evals',
  batches: 'llmharness_batches',
  scenarioSets: 'llmharness_scenario_sets',
};
const col = (alias: CollectionAlias) => COLLECTION_NAME[alias];

export interface AppDbDoc<T> {
  id: string;
  content: T;
}

// AppDB GET results may arrive as a bare array or wrapped in `.body`/`.response`.
// Always normalize to an array so callers can safely map (a wrapped object that
// got `.map()`-ed used to throw and silently drop the app into demo mode).
function toArray<T>(res: unknown): AppDbDoc<T>[] {
  const r = res as any;
  const arr = Array.isArray(r) ? r : r?.body ?? r?.response ?? r?.documents ?? [];
  return Array.isArray(arr) ? (arr as AppDbDoc<T>[]) : [];
}

export async function listDocs<T>(alias: CollectionAlias): Promise<AppDbDoc<T>[]> {
  const res = await domo.get(`/domo/datastores/v1/collections/${col(alias)}/documents/`);
  return toArray<T>(res);
}

export async function queryDocs<T>(alias: CollectionAlias, query: Record<string, unknown>): Promise<AppDbDoc<T>[]> {
  const res = await domo.post(`/domo/datastores/v1/collections/${col(alias)}/documents/query`, query);
  return toArray<T>(res);
}

export async function createDoc<T>(alias: CollectionAlias, content: T): Promise<AppDbDoc<T>> {
  const res = await domo.post(`/domo/datastores/v1/collections/${col(alias)}/documents/`, { content });
  return res as unknown as AppDbDoc<T>;
}

export async function updateDoc<T>(alias: CollectionAlias, id: string, content: T): Promise<AppDbDoc<T>> {
  const res = await domo.put(`/domo/datastores/v1/collections/${col(alias)}/documents/${id}`, { content });
  return res as unknown as AppDbDoc<T>;
}

export async function deleteDoc(alias: CollectionAlias, id: string): Promise<void> {
  await domo.delete(`/domo/datastores/v1/collections/${col(alias)}/documents/${id}`);
}

// ─── Code Engine: Bedrock broker ──────────────────────────────────────────────

export interface RunScenarioParams {
  scenario: { id: string; instruction: string; input_context?: string; task_type: string };
  modelConfig: Record<string, unknown>;
  repeatIndex?: number;
  dryRun?: boolean;
}

export interface RunResult {
  status: 'ok' | 'error' | 'throttled' | 'dry_run';
  run: {
    scenario_id: string;
    repeat_index: number;
    output_text?: string;
    resolved_prompt?: string;
    model_id_resolved?: string;
    input_tokens?: number;
    output_tokens?: number;
    latency_ms?: number;
    cost_usd?: number;
    request_id?: string | null;
    timestamp: string;
  };
  error: string | null;
}

// CE responses are wrapped — sometimes in `body`/`data`, and the function's
// return value sits under the output alias `result` (and/or a `response`
// envelope). Peel these layers until we reach the {status, run|eval, error} shape.
function unwrap<T>(response: unknown): T {
  let cur: any = (response as any)?.body ?? (response as any)?.data ?? response;
  for (let i = 0; i < 6 && cur && typeof cur === 'object'; i++) {
    if (cur.response && typeof cur.response === 'object') { cur = cur.response; continue; }
    if (cur.result && typeof cur.result === 'object') { cur = cur.result; continue; }
    break;
  }
  return cur as T;
}

export async function runScenario(params: RunScenarioParams): Promise<RunResult> {
  const response = await domo.post('/domo/codeengine/v2/packages/runScenario', params);
  return unwrap<RunResult>(response);
}

// ─── Code Engine: scorer (real eval engine, N3) ───────────────────────────────

export interface ScoreRunParams {
  scenario: { gold_answer: string; scorer_type: string; task_type: string; account_ref?: string };
  run: { output_text?: string; status: string };
}

export interface ScoreResult {
  status: 'ok' | 'error';
  eval: {
    score: number;
    score_breakdown?: Record<string, unknown> | null;
    needs_human_review: boolean;
    scorer_type: string;
    scorer_version: string;
    threshold: number;
  } | null;
  error: string | null;
}

export async function scoreRun(params: ScoreRunParams): Promise<ScoreResult> {
  const response = await domo.post('/domo/codeengine/v2/packages/scoreRun', params);
  return unwrap<ScoreResult>(response);
}
