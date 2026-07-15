/**
 * Shared scoring (used by the playground + the batch engine).
 * Real scoring happens server-side via the `scoreRun` Code Engine function.
 * `localScore` is a graded fallback (lexical similarity / structured F1) so a
 * result is never a flat 0 just because server embeddings are unavailable.
 */
import { scoreRun as ceScoreRun } from './domo';
import { BEDROCK_ACCOUNT_REF, TASK_THRESHOLDS } from '../types/harness';
import type { HarnessEval, HarnessRun, Scenario } from '../types/harness';

const normalize = (v: unknown) =>
  String(v ?? '').trim().toLowerCase().replace(/[."'\s]/g, '');

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'is', 'are', 'be', 'with',
  'that', 'this', 'it', 'as', 'at', 'by', 'from', 'will', 'can', 'their', 'they', 'you', 'your',
]);

function tokenize(s: string): string[] {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Term-frequency cosine similarity in [0,1] — a graded lexical proxy for
 *  semantic similarity when embeddings aren't available. */
export function lexicalSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const tf = (arr: string[]) => {
    const m = new Map<string, number>();
    arr.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
    return m;
  };
  const ma = tf(ta);
  const mb = tf(tb);
  let dot = 0;
  let na = 0;
  let nb = 0;
  ma.forEach((v, k) => { na += v * v; if (mb.has(k)) dot += v * (mb.get(k) as number); });
  mb.forEach((v) => { nb += v * v; });
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function tryParseJson(v: unknown): unknown {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(String(v)); }
  catch {
    const m = String(v).match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) { try { return JSON.parse(m[0]); } catch { return undefined; } }
    return undefined;
  }
}

function structuredScoreLocal(predRaw: unknown, goldRaw: unknown): number {
  const gold = tryParseJson(goldRaw);
  const pred = tryParseJson(predRaw);
  if (gold === undefined || pred === undefined) return 0;
  const norm = (x: unknown) => normalize(typeof x === 'object' ? JSON.stringify(x) : x);
  if (Array.isArray(gold)) {
    const g = gold.map(norm);
    const p = Array.isArray(pred) ? pred.map(norm) : [norm(pred)];
    const tp = g.filter((x) => p.includes(x)).length;
    const prec = p.length ? tp / p.length : 0;
    const rec = g.length ? tp / g.length : 0;
    return prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
  }
  const obj = gold as Record<string, unknown>;
  const predObj = (pred && typeof pred === 'object' ? pred : {}) as Record<string, unknown>;
  const keys = Object.keys(obj);
  let matched = 0;
  keys.forEach((k) => { if (predObj[k] != null && norm(predObj[k]) === norm(obj[k])) matched += 1; });
  const pk = Object.keys(predObj).length;
  const prec = pk ? matched / pk : 0;
  const rec = keys.length ? matched / keys.length : 0;
  return prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
}

export function localScore(scenario: Scenario, run: HarnessRun): HarnessEval {
  const threshold = TASK_THRESHOLDS[scenario.task_type] ?? 0.85;
  let score = 0;
  let version = 'local-lexical';
  if (run.status === 'ok') {
    const out = run.output_text ?? '';
    switch (scenario.scorer_type) {
      case 'exact':
        score = normalize(out) === normalize(scenario.gold_answer) ? 1 : 0;
        version = 'local-exact';
        break;
      case 'label':
        score = normalize(out).includes(normalize(scenario.gold_answer)) ? 1 : 0;
        version = 'local-label';
        break;
      case 'structured_field':
        score = Number(structuredScoreLocal(out, scenario.gold_answer).toFixed(3));
        version = 'local-structured';
        break;
      case 'reference_similarity':
      default:
        score = Number(lexicalSimilarity(out, scenario.gold_answer).toFixed(3));
        version = 'local-lexical';
        break;
    }
  }
  return {
    id: `eval_${run.id}`,
    run_id: run.id,
    scenario_id: scenario.id,
    model_config_id: run.model_config_id,
    task_type: scenario.task_type,
    score,
    threshold,
    needs_human_review: run.status === 'ok' && score < threshold,
    scorer_type: scenario.scorer_type,
    scorer_version: version,
  };
}

export async function evaluateRun(scenario: Scenario, run: HarnessRun): Promise<HarnessEval> {
  const local = localScore(scenario, run);
  try {
    const sr = await ceScoreRun({
      scenario: {
        gold_answer: scenario.gold_answer,
        scorer_type: scenario.scorer_type,
        task_type: scenario.task_type,
        account_ref: BEDROCK_ACCOUNT_REF,
      },
      run: { output_text: run.output_text, status: run.status },
    });
    if (sr.status === 'ok' && sr.eval) {
      let score = sr.eval.score;
      let version = sr.eval.scorer_version;
      let breakdown = sr.eval.score_breakdown ?? undefined;
      // Fidelity guard: if the server similarity scorer returns 0 (embeddings
      // unavailable) but the output overlaps the gold, use the lexical proxy so
      // we don't report a misleading flat zero.
      if (
        scenario.scorer_type === 'reference_similarity' &&
        run.status === 'ok' &&
        (score == null || score === 0) &&
        local.score > 0
      ) {
        score = local.score;
        version = 'lexical-fallback';
        breakdown = { ...(breakdown ?? {}), note: 'server embeddings unavailable — lexical cosine fallback', lexical: local.score };
      }
      return {
        id: `eval_${run.id}`,
        run_id: run.id,
        scenario_id: scenario.id,
        model_config_id: run.model_config_id,
        task_type: scenario.task_type,
        score,
        threshold: sr.eval.threshold,
        needs_human_review: run.status === 'ok' && score < sr.eval.threshold,
        scorer_type: scenario.scorer_type,
        score_breakdown: breakdown,
        scorer_version: version,
      };
    }
  } catch {
    /* fall through to local fallback */
  }
  return local;
}
