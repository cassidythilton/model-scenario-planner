/**
 * Code Engine package: scorer
 *
 * Server-side eval engine for the LLM Market-Fit Harness.
 * Dispatches on scenario.scorer_type: exact | label | structured_field | reference_similarity.
 *
 * Auth (v1.0.3): reference_similarity embeddings use a **Bedrock API key**
 * (Bearer) — injected at deploy time by build-payload.mjs (__BEDROCK_API_KEY__).
 * No Domo Account / SigV4 (see bedrock-broker for rationale).
 *
 * Primary function: scoreRun(scenario, run)
 */

const codeengine = require('codeengine');

async function scoreRun(scenario, run) {
  const SCORER_VERSION = 'v2.1.0';
  const BEDROCK_API_KEY = '__BEDROCK_API_KEY__';
  const DEFAULT_REGION = 'us-east-2';
  const EMBED_MODEL = 'amazon.titan-embed-text-v2:0';

  const TASK_THRESHOLDS = {
    classification: 0.95, extraction: 0.92, structured_output: 0.9,
    rag_qa: 0.88, summarization: 0.85, reasoning_multistep: 0.82, agentic: 0.8,
  };

  const normalize = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/[."'\s]/g, '');

  const tryParseJson = (v) => {
    if (v && typeof v === 'object') return v;
    try { return JSON.parse(String(v)); }
    catch (e) {
      const m = String(v).match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (m) { try { return JSON.parse(m[0]); } catch (e2) { return undefined; } }
      return undefined;
    }
  };

  const structuredScore = (predRaw, goldRaw) => {
    const pred = tryParseJson(predRaw);
    const gold = tryParseJson(goldRaw);
    if (gold === undefined) return { score: 0, breakdown: { error: 'gold not parseable as JSON' } };
    if (pred === undefined) return { score: 0, breakdown: { error: 'prediction not valid JSON', parse_valid: false } };
    const norm = (x) => normalize(typeof x === 'object' ? JSON.stringify(x) : x);
    if (Array.isArray(gold)) {
      const goldSet = gold.map(norm);
      const predSet = Array.isArray(pred) ? pred.map(norm) : [norm(pred)];
      const tp = goldSet.filter((g) => predSet.includes(g)).length;
      const precision = predSet.length ? tp / predSet.length : 0;
      const recall = goldSet.length ? tp / goldSet.length : 0;
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      return { score: Number(f1.toFixed(3)), breakdown: { precision, recall, f1, tp, pred_n: predSet.length, gold_n: goldSet.length, parse_valid: true } };
    }
    const keys = Object.keys(gold);
    const perField = {};
    let matched = 0;
    keys.forEach((k) => { const ok = pred[k] != null && norm(pred[k]) === norm(gold[k]); perField[k] = ok; if (ok) matched += 1; });
    const predKeys = pred && typeof pred === 'object' ? Object.keys(pred) : [];
    const precision = predKeys.length ? matched / predKeys.length : 0;
    const recall = keys.length ? matched / keys.length : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { score: Number(f1.toFixed(3)), breakdown: { precision, recall, f1, per_field: perField, matched, gold_fields: keys.length, parse_valid: true } };
  };

  const embed = async (text) => {
    const url = `https://bedrock-runtime.${DEFAULT_REGION}.amazonaws.com/model/${encodeURIComponent(EMBED_MODEL)}/invoke`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${BEDROCK_API_KEY}` };
    const res = await codeengine.axios({ method: 'POST', url, headers, data: JSON.stringify({ inputText: String(text || '').slice(0, 8000) }), timeout: 60000 });
    return (res.data && res.data.embedding) || [];
  };

  const cosine = (a, b) => {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  };

  // Graded lexical similarity — fallback when embeddings are unavailable so a
  // qualifying answer never reports a misleading flat 0.
  var STOP = { the:1,a:1,an:1,and:1,or:1,of:1,to:1,in:1,for:1,on:1,is:1,are:1,be:1,with:1,that:1,this:1,it:1,as:1,at:1,by:1,from:1,will:1,can:1,their:1,they:1,you:1,your:1 };
  const lexTokens = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP[t]);
  const lexicalSim = (a, b) => {
    const ta = lexTokens(a), tb = lexTokens(b);
    if (!ta.length || !tb.length) return 0;
    const tf = (arr) => { const m = {}; arr.forEach((t) => { m[t] = (m[t] || 0) + 1; }); return m; };
    const ma = tf(ta), mb = tf(tb);
    let dot = 0, na = 0, nb = 0;
    Object.keys(ma).forEach((k) => { na += ma[k] * ma[k]; if (mb[k]) dot += ma[k] * mb[k]; });
    Object.keys(mb).forEach((k) => { nb += mb[k] * mb[k]; });
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  };

  const scorerType = scenario && scenario.scorer_type;
  const taskType = scenario && scenario.task_type;
  const threshold = TASK_THRESHOLDS[taskType] != null ? TASK_THRESHOLDS[taskType] : 0.85;
  const mkEval = (score, breakdown, needsReview) => ({
    status: 'ok',
    eval: { score: Number(score), score_breakdown: breakdown || null, needs_human_review: !!needsReview, scorer_type: scorerType, scorer_version: SCORER_VERSION, threshold },
    error: null,
  });

  try {
    if (!run || run.status !== 'ok') return mkEval(0, { reason: 'run not ok', status: run && run.status }, false);
    const output = run.output_text;
    const gold = scenario.gold_answer;

    if (scorerType === 'exact') return mkEval(normalize(output) === normalize(gold) ? 1 : 0, null, false);
    if (scorerType === 'label') {
      const golds = Array.isArray(gold) ? gold : [gold];
      const hit = golds.some((g) => normalize(output) === normalize(g) || normalize(output).includes(normalize(g)));
      return mkEval(hit ? 1 : 0, { gold: golds }, false);
    }
    if (scorerType === 'structured_field') {
      const { score, breakdown } = structuredScore(output, gold);
      return mkEval(score, breakdown, score < threshold);
    }
    if (scorerType === 'reference_similarity') {
      let eo = [];
      let eg = [];
      let embedErr = null;
      try {
        [eo, eg] = await Promise.all([embed(output), embed(gold)]);
      } catch (e) {
        embedErr = (e && e.message) || String(e);
      }
      const sim = Number(cosine(eo, eg).toFixed(4));
      if (sim > 0) return mkEval(sim, { cosine: sim, embed_model: EMBED_MODEL, method: 'embedding' }, sim < threshold);
      // Embeddings unavailable/empty → graded lexical fallback (never a flat 0).
      const lex = Number(lexicalSim(output, gold).toFixed(4));
      return mkEval(lex, { method: 'lexical-fallback', lexical: lex, embed_ok: false, embed_error: embedErr }, lex < threshold);
    }
    return { status: 'error', eval: null, error: `Unknown scorer_type: ${scorerType}` };
  } catch (err) {
    return { status: 'error', eval: null, error: (err && err.message) || String(err) };
  }
}

module.exports = { scoreRun };
