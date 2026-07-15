import { useMemo, useState } from 'react';
import {
  CartesianGrid, Label, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { FRONTIER_CONFIG_ID } from '../data/demoHarness';
import { fmtCost, fmtDelta, fmtMs, fmtPct, fmtScore, gapByIntervention, type MetricsContext } from '../lib/metrics';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';
import type { HarnessEval, HarnessRun, ModelConfig, ModelMetrics, Scenario, TaskType } from '../types/harness';
import { COST_CEILING_USD, TASK_LABELS, TASK_THRESHOLDS } from '../types/harness';

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const TIER_COLOR: Record<string, string> = {
  frontier: '#6e56cf',
  secondary: '#0f62fe',
  open_weight: '#0e9488',
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const gapColor = (g: number) => (g <= 0.03 ? '#15803d' : g <= 0.07 ? '#b45309' : '#be123c');
// Consistent USD axis ticks (avoids fmtCost's mixed milli-dollar / dollar units on one axis).
const fmtAxisCost = (v: number) => (v === 0 ? '$0' : `$${v.toFixed(4)}`);

interface Props {
  ctx: MetricsContext;
  scenarios: Scenario[];
  configs: ModelConfig[];
  runs: HarnessRun[];
  evals: HarnessEval[];
  onRescore?: () => number;
}

export function ResultsMap({ ctx, scenarios, configs, runs, evals, onRescore }: Props) {
  const metrics = ctx.metrics.filter((m) => m.okRuns > 0);
  const secondary = metrics.filter((m) => m.config.id !== FRONTIER_CONFIG_ID);
  const [taskFilter, setTaskFilter] = useState<TaskType | 'all'>('all');
  const [drillId, setDrillId] = useState<string | null>(null);
  const [rescored, setRescored] = useState<number | null>(null);

  const taskTypes = (Object.keys(TASK_LABELS) as TaskType[]).filter((t) =>
    scenarios.some((s) => s.task_type === t)
  );

  const avgGap = mean(secondary.map((m) => m.gapToFrontier));
  const bestSavings = Math.max(0, ...secondary.map((m) => m.savingsAtParity ?? 0));
  const okRunCount = runs.filter((r) => r.status === 'ok').length;

  // ---- scatter data (per-task filter switches the y dimension) ----
  const scoreFor = (m: ModelMetrics) =>
    taskFilter === 'all' ? m.avgScore : m.perTask[taskFilter]?.avgScore ?? null;
  const points = metrics
    .map((m) => {
      const s = scoreFor(m);
      return s == null ? null : {
        id: m.config.id,
        name: m.config.short_label,
        tier: m.config.tier,
        x: m.avgCost,
        y: Number((s * 100).toFixed(1)),
        anchor: m.config.id === FRONTIER_CONFIG_ID,
      };
    })
    .filter(Boolean) as { id: string; name: string; tier: string; x: number; y: number; anchor: boolean }[];

  // Pareto-efficient set among displayed points (low cost, high score).
  const paretoLine = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const out: typeof points = [];
    let best = -Infinity;
    for (const p of sorted) { if (p.y > best) { out.push(p); best = p.y; } }
    return out;
  }, [points]);

  const maxQpd = Math.max(...secondary.map((m) => m.qualityPerDollar), 1);
  const leaderboard = [...secondary].sort((a, b) => b.qualityPerDollar - a.qualityPerDollar);
  const intervention = gapByIntervention(ctx);

  const evalByRun = useMemo(() => new Map(evals.map((e) => [e.run_id, e])), [evals]);
  const scnById = useMemo(() => new Map(scenarios.map((s) => [s.id, s])), [scenarios]);
  const cfgById = useMemo(() => new Map(configs.map((c) => [c.id, c])), [configs]);
  const recent = [...runs].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 9);

  // ---- quadrant geometry for the scatter ----
  const xMax = points.length ? Math.max(...points.map((p) => p.x)) * 1.15 : 0.001;
  const xMid = points.length ? median(points.map((p) => p.x)) : xMax / 2;
  const yBar = 90; // quality bar separating "sweet spot" from "pricey/weak"

  // ---- Decision summary: cost winner vs quality winner per task ----
  const decision = useMemo(() => {
    return taskTypes
      .map((t) => {
        const entries = metrics
          .map((m) => {
            const scores = evals
              .filter((e) => e.model_config_id === m.config.id && scnById.get(e.scenario_id)?.task_type === t)
              .map((e) => e.score);
            const costs = runs
              .filter((r) => r.status === 'ok' && r.cost_usd != null && r.model_config_id === m.config.id && scnById.get(r.scenario_id)?.task_type === t)
              .map((r) => r.cost_usd as number);
            return scores.length ? { cfg: m.config, score: mean(scores), cost: costs.length ? mean(costs) : null } : null;
          })
          .filter(Boolean) as { cfg: ModelConfig; score: number; cost: number | null }[];
        if (!entries.length) return null;
        const quality = entries.reduce((a, b) => (b.score > a.score ? b : a));
        const withCost = entries.filter((e) => e.cost != null && e.cost > 0);
        const cost = withCost.length ? withCost.reduce((a, b) => ((b.cost as number) < (a.cost as number) ? b : a)) : null;
        const aligned = cost ? cost.cfg.id === quality.cfg.id : null;
        return { task: t, quality, cost, aligned };
      })
      .filter(Boolean) as { task: TaskType; quality: { cfg: ModelConfig; score: number }; cost: { cfg: ModelConfig; cost: number | null } | null; aligned: boolean | null }[];
  }, [taskTypes, metrics, evals, runs, scnById]);

  // ---- live spend + replay share ----
  const liveSpend = runs.filter((r) => r.status === 'ok' && !r.is_demo).reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const replayShare = runs.length ? runs.filter((r) => r.is_demo).length / runs.length : 0;
  const spendPct = Math.min(100, (liveSpend / COST_CEILING_USD) * 100);

  // ---- hill-climb: scored runs over time, new-best highlighted ----
  const climb = useMemo(() => {
    const scored = runs
      .filter((r) => r.status === 'ok' && evalByRun.get(r.id)?.score != null)
      .map((r) => ({ t: Date.parse(r.timestamp), score: evalByRun.get(r.id)!.score }))
      .sort((a, b) => a.t - b.t);
    let best = -Infinity;
    return scored.map((x, i) => {
      const isBest = x.score > best;
      if (isBest) best = x.score;
      return { i: i + 1, score: Number((x.score * 100).toFixed(1)), best: isBest };
    });
  }, [runs, evalByRun]);

  // ---- data provenance / freshness ----
  const okAll = runs.filter((r) => r.status === 'ok');
  const scnCovered = new Set(okAll.map((r) => r.scenario_id)).size;
  const mdlCovered = new Set(okAll.map((r) => r.model_config_id)).size;
  const lastRunTs = runs.length ? Math.max(...runs.map((r) => Date.parse(r.timestamp))) : null;

  // ---- paired accuracy gap vs. anchor (same scenarios only) ----
  const pairedGaps = useMemo(() => {
    const key = (m: string, s: string) => `${m}|${s}`;
    const agg = new Map<string, { sum: number; n: number }>();
    evals.forEach((e) => {
      const k = key(e.model_config_id, e.scenario_id);
      const cur = agg.get(k) ?? { sum: 0, n: 0 };
      cur.sum += e.score; cur.n += 1; agg.set(k, cur);
    });
    const look = (m: string, s: string): number | null => {
      const v = agg.get(key(m, s));
      return v && v.n ? v.sum / v.n : null;
    };
    return taskTypes
      .map((t) => {
        const scns = scenarios.filter((s) => s.task_type === t);
        const anchorScns = scns.filter((s) => look(FRONTIER_CONFIG_ID, s.id) != null);
        if (!anchorScns.length) return null;
        const rows = secondary
          .map((m) => {
            const shared = anchorScns.filter((s) => look(m.config.id, s.id) != null);
            if (!shared.length) return null;
            const delta = mean(shared.map((s) => (look(m.config.id, s.id) as number) - (look(FRONTIER_CONFIG_ID, s.id) as number)));
            return { m, delta, n: shared.length };
          })
          .filter(Boolean) as { m: ModelMetrics; delta: number; n: number }[];
        if (!rows.length) return null;
        rows.sort((a, b) => b.delta - a.delta);
        return { t, anchorN: anchorScns.length, rows };
      })
      .filter(Boolean) as { t: TaskType; anchorN: number; rows: { m: ModelMetrics; delta: number; n: number }[] }[];
  }, [taskTypes, scenarios, secondary, evals]);
  const gapMaxAbs = Math.max(0.05, ...pairedGaps.flatMap((g) => g.rows.map((r) => Math.abs(r.delta))));

  // ---- what we'd test next, per task ----
  const testNext = taskTypes.map((t) => {
    const scns = scenarios.filter((s) => s.task_type === t);
    const nRuns = runs.filter((r) => r.status === 'ok' && scnById.get(r.scenario_id)?.task_type === t).length;
    const suggestions: string[] = [];
    if (!scns.some((s) => s.split === 'holdout')) suggestions.push('add a holdout split');
    if (scns.length < 3) suggestions.push('widen difficulty range');
    suggestions.push('raise repeats to 3 for reliability');
    return { t, nRuns, nScn: scns.length, suggestions };
  });

  return (
    <div className="map">
      <div className="map-head">
        <span className="eyebrow">Executive results map</span>
        <h2>Where the cheaper-model case holds — and where it breaks</h2>
        <p>
          Segmented by task type, never blended into a single winner. The frontier curve marks the
          cost-vs-accuracy efficient set; gap-by-task shows exactly which work a secondary model can absorb.
        </p>
      </div>

      <div className="rm-provenance">
        <span className="rm-prov-text">
          <strong>Data:</strong> all persisted results from AppDB (Playground + Batches) · {okRunCount} scored runs ·
          {' '}{scnCovered}/{scenarios.length} scenarios · {mdlCovered}/{configs.length} models
          {lastRunTs ? ` · latest run ${new Date(lastRunTs).toLocaleString()}` : ''}
        </span>
        {onRescore && (
          <button
            className="info-btn"
            title="Recompute every saved score with the current grader — no new Bedrock calls. Normalizes older/stale runs."
            onClick={() => { const n = onRescore(); setRescored(n); setTimeout(() => setRescored(null), 2500); }}
          >
            {rescored != null ? `Re-scored ${rescored} runs ✓` : 'Re-score all saved runs'}
          </button>
        )}
      </div>

      <div className="heroes">
        <div className="card hero rise">
          <div className="hero-label">Configs evaluated</div>
          <div className="hero-value">{metrics.length}</div>
          <div className="hero-detail">{okRunCount} scored runs</div>
        </div>
        <div className="card hero rise">
          <div className="hero-label">Task archetypes</div>
          <div className="hero-value">{taskTypes.length}</div>
          <div className="hero-detail">{scenarios.length} scenarios, easy → hard</div>
        </div>
        <div className="card hero hero--accent rise">
          <div className="hero-label">Avg gap to frontier</div>
          <div className="hero-value">{fmtDelta(-avgGap)}</div>
          <div className="hero-detail">secondary tiers, points of accuracy</div>
        </div>
        <div className="card hero hero--good rise">
          <div className="hero-label">Best savings at parity</div>
          <div className="hero-value">{fmtPct(bestSavings)}</div>
          <div className="hero-detail">cost cut where threshold is met</div>
        </div>
        <div className="card hero rise">
          <div className="hero-label">Live Bedrock spend</div>
          <div className="hero-value">${liveSpend < 0.01 ? liveSpend.toFixed(4) : liveSpend.toFixed(2)}</div>
          <div className="hero-detail">{spendPct.toFixed(spendPct < 1 ? 2 : 0)}% of ${COST_CEILING_USD} cap · {fmtPct(replayShare)} replayed</div>
          <div className="spend-track"><i style={{ width: `${Math.max(1, spendPct)}%` }} /></div>
        </div>
      </div>

      <div className="map-split">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Cost-performance frontier</span>
              <h3>Accuracy vs. cost per task</h3>
            </div>
            <Dropdown
              full={false}
              ariaLabel="Task filter"
              value={taskFilter}
              onChange={(v) => setTaskFilter(v as TaskType | 'all')}
              options={[{ value: 'all', label: 'All tasks' }, ...taskTypes.map((t) => ({ value: t, label: TASK_LABELS[t] }))]}
            />
          </div>

          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 12, right: 24, bottom: 48, left: 24 }}>
                <CartesianGrid strokeOpacity={0.35} />
                {/* faint quadrants — sweet spot (cheap + accurate) vs avoid (pricey + weak) */}
                <ReferenceArea x1={0} x2={xMid} y1={yBar} y2={100} fill="#15803d" fillOpacity={0.06} stroke="none">
                  <Label value="SWEET SPOT" position="insideTopLeft" style={{ fontSize: 9.5, fontWeight: 700, fill: '#15803d', letterSpacing: '0.06em', opacity: 0.7 }} />
                </ReferenceArea>
                <ReferenceArea x1={xMid} x2={xMax} y1={75} y2={yBar} fill="#be123c" fillOpacity={0.06} stroke="none">
                  <Label value="AVOID" position="insideBottomRight" style={{ fontSize: 9.5, fontWeight: 700, fill: '#be123c', letterSpacing: '0.06em', opacity: 0.7 }} />
                </ReferenceArea>
                <XAxis
                  type="number" dataKey="x" name="Cost/task" tickFormatter={fmtAxisCost}
                  tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, xMax]} allowDataOverflow
                >
                  <Label
                    value="Cost per task (USD) — lower is better ←"
                    position="insideBottom" offset={-34}
                    style={{ fontSize: 11.5, fill: '#64748b', fontWeight: 600 }}
                  />
                </XAxis>
                <YAxis
                  type="number" dataKey="y" name="Score" domain={[75, 100]} unit=""
                  tick={{ fontSize: 11 }} stroke="#94a3b8"
                >
                  <Label
                    value="Quality / accuracy (%) — higher is better →"
                    angle={-90} position="insideLeft" offset={2}
                    style={{ fontSize: 11.5, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' }}
                  />
                </YAxis>
                <ZAxis range={[90, 90]} />
                <Tooltip content={<ScatterTip />} cursor={{ strokeDasharray: '3 3' }} />
                {paretoLine.length > 1 && (
                  <Scatter data={paretoLine} line={{ stroke: '#6e56cf', strokeWidth: 1.5 }} fill="none" shape={() => <g />} legendType="none" isAnimationActive={false} />
                )}
                <Scatter
                  data={points}
                  isAnimationActive={false}
                  onClick={(d: unknown) => { const p = d as { id?: string }; if (p?.id) setDrillId(p.id); }}
                  shape={(props: unknown) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: { tier: string; anchor: boolean } };
                    const color = TIER_COLOR[payload.tier] ?? '#0f62fe';
                    return (
                      <g style={{ cursor: 'pointer' }}>
                        {payload.anchor && <circle cx={cx} cy={cy} r={10} fill="none" stroke={color} strokeOpacity={0.5} />}
                        <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={1.5} />
                      </g>
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="legend-row">
            <span className="legend-item"><span className="tier-dot frontier" /> Frontier</span>
            <span className="legend-item"><span className="tier-dot secondary" /> Secondary</span>
            <span className="legend-item"><span className="tier-dot open_weight" /> Open weight</span>
            <span className="legend-item muted">click a point to inspect runs · top-left wins</span>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Accuracy vs. the frontier anchor</span>
              <h3>Δ points on shared scenarios</h3>
            </div>
            <span className="section-sub">paired on the same scenarios · green = matches/beats · red = behind</span>
          </div>
          <div className="gap-task">
            {pairedGaps.length === 0 && (
              <p className="muted" style={{ fontSize: 12 }}>
                No secondary model shares a scored scenario with the anchor yet — run the anchor and a secondary on the same scenario, then compare here.
              </p>
            )}
            {pairedGaps.map(({ t, anchorN, rows }) => (
              <div className="gap-row" key={t}>
                <div className="gap-row-head">
                  <strong>{TASK_LABELS[t]}</strong>
                  <span>{anchorN} scenario{anchorN === 1 ? '' : 's'} vs anchor</span>
                </div>
                <div className="gap-bars">
                  {rows.map(({ m, delta, n }) => {
                    const w = Math.min(50, (Math.abs(delta) / gapMaxAbs) * 50);
                    const ahead = delta >= -0.03;
                    return (
                      <div className="gap-bar gap-bar--div" key={m.config.id}>
                        <span className="gb-name">{m.config.short_label}</span>
                        <div className="gb-diverge">
                          <span className="gb-center" />
                          <div
                            className="gb-dfill"
                            style={{ [delta >= 0 ? 'left' : 'right']: '50%', width: `${w}%`, background: ahead ? '#15803d' : '#be123c' }}
                          />
                        </div>
                        <span className={`gb-val ${ahead ? 'pos' : 'neg'}`}>{fmtDelta(delta)}</span>
                        <span className="gb-cov" title="scenarios shared with the anchor">{n}/{anchorN}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decision summary — cost winner vs quality winner per task */}
      <div className="card card-pad">
        <div className="section-head">
          <div>
            <span className="eyebrow">Decision summary</span>
            <h3>Per task: who wins on cost, who wins on quality</h3>
          </div>
          <span className="section-sub">✓ aligned = clean pick · ⚑ tradeoff = the conversation</span>
        </div>
        <div className="decision-grid">
          {decision.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Run a few scenarios to populate the decision summary.</p>}
          {decision.map((d) => (
            <div className={`decision-row ${d.aligned === false ? 'is-tradeoff' : d.aligned ? 'is-aligned' : ''}`} key={d.task}>
              <div className="decision-task">
                <strong>{TASK_LABELS[d.task]}</strong>
                {d.aligned === false ? (
                  <span className="decision-flag flag-tradeoff">⚑ tradeoff</span>
                ) : d.aligned ? (
                  <span className="decision-flag flag-aligned">✓ aligned</span>
                ) : (
                  <span className="decision-flag flag-na">cost n/a</span>
                )}
              </div>
              <div className="decision-winners">
                <div className="dw">
                  <span className="dw-label">Quality</span>
                  <span className="dw-name"><span className={`tier-dot ${d.quality.cfg.tier}`} /> {d.quality.cfg.short_label}</span>
                  <span className="dw-val">{fmtScore(d.quality.score)}</span>
                </div>
                <div className="dw">
                  <span className="dw-label">Lowest cost</span>
                  {d.cost ? (
                    <>
                      <span className="dw-name"><span className={`tier-dot ${d.cost.cfg.tier}`} /> {d.cost.cfg.short_label}</span>
                      <span className="dw-val">{fmtCost(d.cost.cost ?? 0)}</span>
                    </>
                  ) : (
                    <span className="dw-name muted">—</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pre-registration pass/fail + gap-by-intervention */}
      <div className="map-split">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Pre-registration verdict</span>
              <h3>Did each config hit its declared threshold?</h3>
            </div>
            <span className="section-sub">avg score ≥ registered threshold, per task</span>
          </div>
          <div className="prereg-scroll">
            <table className="prereg">
              <thead>
                <tr>
                  <th>Config</th>
                  {taskTypes.map((t) => (
                    <th key={t} title={`threshold ${Math.round(TASK_THRESHOLDS[t] * 100)}`}>{TASK_LABELS[t]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.config.id} onClick={() => setDrillId(m.config.id)} style={{ cursor: 'pointer' }}>
                    <td className="prereg-name"><span className={`tier-dot ${m.config.tier}`} /> {m.config.short_label}</td>
                    {taskTypes.map((t) => {
                      const pt = m.perTask[t];
                      if (!pt) return <td key={t} className="prereg-na">—</td>;
                      const pass = pt.avgScore >= TASK_THRESHOLDS[t];
                      return <td key={t} className={pass ? 'prereg-pass' : 'prereg-fail'}>{pass ? '✓' : '✗'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Gap-closing by intervention</span>
              <h3>Does configuration narrow the gap?</h3>
            </div>
            <span className="section-sub">avg secondary gap per lever</span>
          </div>
          <div className="interv-list">
            {intervention.map((g) => (
              <div className="interv-row" key={g.intervention}>
                <span className="interv-name">{g.intervention}</span>
                <div className="interv-track">
                  <div className="interv-fill" style={{ width: `${Math.min(100, (g.avgGap / 0.2) * 100)}%`, background: gapColor(g.avgGap) }} />
                </div>
                <span className="interv-val">{fmtDelta(-g.avgGap)} · {g.count} cfg</span>
              </div>
            ))}
            {intervention.length <= 1 && (
              <p className="muted" style={{ fontSize: 12 }}>
                Add few-shot / RAG configs in the Models tab to compare interventions here.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="map-split">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Efficiency</span>
              <h3>Quality-per-dollar leaderboard</h3>
            </div>
            <span className="section-sub">click a row to inspect runs</span>
          </div>
          {leaderboard.map((m, i) => (
            <div className="lead-row" key={m.config.id} onClick={() => setDrillId(m.config.id)} style={{ cursor: 'pointer' }}>
              <div className="lead-rank">{i + 1}</div>
              <div>
                <div className="lead-name">
                  <span className={`tier-dot ${m.config.tier}`} />
                  {m.config.short_label}
                </div>
                <div className="lead-bar">
                  <i style={{ width: `${(m.qualityPerDollar / maxQpd) * 100}%`, background: TIER_COLOR[m.config.tier] }} />
                </div>
              </div>
              <div className="lead-metric">
                <div className="m1">{fmtScore(m.avgScore)} @ {fmtCost(m.avgCost)}</div>
                <div className="m2">{fmtPct(m.passRate)} pass · {fmtPct(m.winRate)} win</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Reliability</span>
              <h3>Consistency &amp; speed</h3>
            </div>
            <span className="section-sub">reliability is half the story for small models</span>
          </div>
          {metrics.map((m) => (
            <div className="rel-row" key={m.config.id} onClick={() => setDrillId(m.config.id)} style={{ cursor: 'pointer' }}>
              <div className="lead-name">
                <span className={`tier-dot ${m.config.tier}`} />
                {m.config.short_label}
              </div>
              <div className="rel-stats">
                <div className="rel-chip"><b>Consist.</b>{fmtPct(m.consistency)}</div>
                <div className="rel-chip"><b>p50 / p95</b>{fmtMs(m.avgLatencyP50)} / {fmtMs(m.avgLatencyP95)}</div>
                <div className="rel-chip"><b>Fail</b>{fmtPct(m.failureRate)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="map-split">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Hill-climb</span>
              <h3>Scored runs over time</h3>
            </div>
            <span className="section-sub">green ring = a new best score</span>
          </div>
          {climb.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>No scored runs yet.</p>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
                  <CartesianGrid strokeOpacity={0.35} />
                  <XAxis type="number" dataKey="i" name="Run" tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, climb.length + 1]} allowDecimals={false}>
                    <Label value="Run order →" position="insideBottom" offset={-14} style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  </XAxis>
                  <YAxis type="number" dataKey="score" name="Score" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <ZAxis range={[70, 70]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: number) => [`${v}`, 'score']} />
                  <Scatter
                    data={climb}
                    isAnimationActive={false}
                    line={{ stroke: '#cbd5e1', strokeWidth: 1.25 }}
                    shape={(props: unknown) => {
                      const { cx, cy, payload } = props as { cx: number; cy: number; payload: { best: boolean } };
                      return (
                        <g>
                          {payload.best && <circle cx={cx} cy={cy} r={8} fill="none" stroke="#15803d" strokeWidth={1.5} />}
                          <circle cx={cx} cy={cy} r={4.5} fill={payload.best ? '#15803d' : '#6e56cf'} stroke="#fff" strokeWidth={1} />
                        </g>
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <span className="eyebrow">Methodology</span>
              <h3>What we'd test next</h3>
            </div>
            <span className="section-sub">measured today vs. the next sweep</span>
          </div>
          <div className="testnext-list">
            {testNext.map((tn) => (
              <div className="testnext-row" key={tn.t}>
                <div className="testnext-head">
                  <strong>{TASK_LABELS[tn.t]}</strong>
                  <span className="muted">{tn.nRuns} runs · {tn.nScn} scenarios</span>
                </div>
                <div className="testnext-tags">
                  {tn.suggestions.map((s) => <span className="testnext-tag" key={s}>{s}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <span className="eyebrow">Evidence</span>
            <h3>Most recent run records</h3>
          </div>
        </div>
        <div className="grid-table">
          <div className="grow grow--head">
            <span>Scenario</span><span>Model</span><span>Status</span>
            <span className="num">Score</span><span className="num">Cost</span><span className="num">Latency</span>
          </div>
          {recent.map((r) => {
            const ev = evalByRun.get(r.id);
            const scn = scnById.get(r.scenario_id);
            const cfg = cfgById.get(r.model_config_id);
            return (
              <div className="grow" key={r.id} title={r.request_id ? `Bedrock request-id: ${r.request_id}` : undefined}>
                <span>{scn?.title ?? r.scenario_id}</span>
                <span>{cfg?.short_label ?? r.model_config_id}</span>
                <span className={r.status === 'ok' ? 'good-text' : r.status === 'error' ? 'bad-text' : 'muted'}>{r.status}</span>
                <span className="num">{ev ? fmtScore(ev.score) : '—'}</span>
                <span className="num">{fmtCost(r.cost_usd ?? 0)}</span>
                <span className="num">{r.latency_ms != null ? fmtMs(r.latency_ms) : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {drillId && (
        <DrillModal
          config={cfgById.get(drillId)}
          runs={runs.filter((r) => r.model_config_id === drillId)}
          evalByRun={evalByRun}
          scnById={scnById}
          onClose={() => setDrillId(null)}
        />
      )}
    </div>
  );
}

function ScatterTip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; x: number; y: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{p.name}</strong>
      <div>{p.y} score · {fmtCost(p.x)}/task</div>
    </div>
  );
}

function DrillModal({
  config, runs, evalByRun, scnById, onClose,
}: {
  config?: ModelConfig;
  runs: HarnessRun[];
  evalByRun: Map<string, HarnessEval>;
  scnById: Map<string, Scenario>;
  onClose: () => void;
}) {
  const ordered = [...runs].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return (
    <Modal title={config ? `${config.short_label} — run drill-down` : 'Run drill-down'} onClose={onClose} wide>
      {ordered.length === 0 && <p className="muted">No runs for this config yet.</p>}
      {ordered.slice(0, 30).map((r) => {
        const ev = evalByRun.get(r.id);
        const scn = scnById.get(r.scenario_id);
        return (
          <div className="drill-run" key={r.id}>
            <div className="drill-run-head">
              <strong>{scn?.title ?? r.scenario_id}</strong>
              <span className={`status-pill status-pill--${r.status}`}>{r.status}</span>
              {ev && <span className="drill-score">{fmtScore(ev.score)}{ev.needs_human_review ? ' · review' : ''}</span>}
            </div>
            {r.request_id && (
              <div className="drill-reqid" title="Reconcile against your Bedrock/CloudWatch logs">req-id · {r.request_id}</div>
            )}
            <div className="drill-cols">
              <div>
                <span className="field-label">Model output</span>
                <div className="drill-text">{r.error ? <span className="bad-text">{r.error}</span> : (r.output_text || '—')}</div>
              </div>
              <div>
                <span className="field-label">Gold answer</span>
                <div className="drill-text">{scn?.gold_answer ?? '—'}</div>
              </div>
            </div>
            {ev?.score_breakdown && (
              <div className="drill-breakdown">{JSON.stringify(ev.score_breakdown)}</div>
            )}
          </div>
        );
      })}
    </Modal>
  );
}
