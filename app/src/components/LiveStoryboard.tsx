import { useMemo } from 'react';
import {
  CartesianGrid, Label, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { FRONTIER_CONFIG_ID } from '../data/demoHarness';
import { fmtCost, fmtDelta, fmtMs, fmtScore } from '../lib/metrics';
import { SCORER_INFO } from '../lib/scorers';
import { MethodologyInfo } from './MethodologyInfo';
import type { HarnessEval, HarnessRun, ModelConfig, Scenario } from '../types/harness';
import { TASK_LABELS, TASK_THRESHOLDS } from '../types/harness';

const TIER_COLOR: Record<string, string> = {
  frontier: '#6e56cf',
  secondary: '#0f62fe',
  open_weight: '#0e9488',
};
const fmtAxisCost = (v: number) => (v === 0 ? '$0' : `$${v.toFixed(4)}`);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface Row {
  model: ModelConfig;
  run: HarnessRun;
  score: number | null;
  cost: number | null;
  latency: number | null;
  throughput: number | null;
  isAnchor: boolean;
  ok: boolean;
}

interface Props {
  scenario: Scenario;
  models: ModelConfig[];
  runs: HarnessRun[];
  evals: HarnessEval[];
  running: boolean;
}

export function LiveStoryboard({ scenario, models, runs, evals, running }: Props) {
  const evalByRun = useMemo(() => new Map(evals.map((e) => [e.run_id, e])), [evals]);

  const rows: Row[] = useMemo(() => {
    return models
      .map((model) => {
        const rs = runs.filter((r) => r.scenario_id === scenario.id && r.model_config_id === model.id);
        if (!rs.length) return null;
        const run = rs.reduce((a, b) => (Date.parse(b.timestamp) >= Date.parse(a.timestamp) ? b : a));
        const ev = evalByRun.get(run.id);
        const outTok = run.output_tokens ?? 0;
        return {
          model,
          run,
          score: ev?.score ?? null,
          cost: run.cost_usd ?? null,
          latency: run.latency_ms ?? null,
          throughput: run.latency_ms && run.latency_ms > 0 && outTok > 0 ? outTok / (run.latency_ms / 1000) : null,
          isAnchor: model.id === FRONTIER_CONFIG_ID,
          ok: run.status === 'ok',
        } as Row;
      })
      .filter(Boolean) as Row[];
  }, [models, runs, scenario.id, evalByRun]);

  const ranked = useMemo(
    () => [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    [rows]
  );

  const threshold = TASK_THRESHOLDS[scenario.task_type];
  const lastRun = rows.length ? Math.max(...rows.map((r) => Date.parse(r.run.timestamp))) : null;

  // ---- verdict ----
  const anchor = rows.find((r) => r.isAnchor);
  const fScore = anchor?.score ?? null;
  const fCost = anchor?.cost ?? null;
  const secondaries = rows.filter((r) => !r.isAnchor && r.score != null);
  const bestSec = secondaries.length ? secondaries.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a)) : null;
  // Best value = most accuracy per dollar (quality ÷ cost per task), not just top accuracy.
  const valued = rows.filter((r) => !r.isAnchor && r.score != null && r.cost != null && (r.cost as number) > 0);
  const bestValue = valued.length
    ? valued.reduce((a, b) => ((b.score as number) / (b.cost as number) > (a.score as number) / (a.cost as number) ? b : a))
    : null;
  const anchorValue = fScore != null && fCost != null && fCost > 0 ? fScore / fCost : null;
  const bestValueMult = bestValue && anchorValue ? (bestValue.score as number) / (bestValue.cost as number) / anchorValue : null;

  const verdict = useMemo(() => {
    if (fScore == null || !bestSec) return null;
    const gap = fScore - (bestSec.score as number);
    const mult = fCost && bestSec.cost && bestSec.cost > 0 ? fCost / bestSec.cost : null;
    const tone = gap <= 0.03 ? 'good' : gap <= 0.07 ? 'watch' : 'neutral';
    const icon = tone === 'good' ? '✓' : tone === 'watch' ? '≈' : '↑';
    const headline =
      gap <= 0.03
        ? `${bestSec.model.short_label} matches the frontier — within ${(gap * 100).toFixed(1)} pts`
        : gap <= 0.07
          ? `${bestSec.model.short_label} trails the frontier by ${(gap * 100).toFixed(1)} pts`
          : `Frontier leads by ${(gap * 100).toFixed(1)} pts here`;
    const sub =
      mult && gap <= 0.07
        ? `${mult.toFixed(1)}× lower cost per task` + (gap <= 0.03 ? ' — the cheaper-model case holds.' : ' — within tuning range.')
        : 'This is where a secondary model is hardest to justify.';
    return { tone, icon, headline, sub, mult, gap };
  }, [fScore, fCost, bestSec]);

  if (rows.length === 0) return null;
  const maxScore = Math.max(0.0001, ...rows.map((r) => r.score ?? 0));

  // ---- scatter geometry (rank-numbered markers) ----
  const rankById = new Map(ranked.map((r, i) => [r.model.id, i + 1]));
  const points = rows
    .filter((r) => r.score != null && r.cost != null)
    .map((r) => ({
      id: r.model.id,
      name: r.model.short_label,
      tier: r.model.tier,
      rank: rankById.get(r.model.id) ?? 0,
      x: r.cost as number,
      y: Number(((r.score as number) * 100).toFixed(1)),
      anchor: r.isAnchor,
    }));
  // Adaptive domains so the field spreads out instead of collapsing to a corner.
  const costs = points.map((p) => p.x).filter((v) => v > 0);
  const xMinRaw = costs.length ? Math.min(...costs) : 0;
  const xMaxRaw = costs.length ? Math.max(...costs) : 0.001;
  const useLog = costs.length >= 2 && xMaxRaw / Math.max(xMinRaw, 1e-9) >= 8;
  const xDomain: [number, number] = useLog ? [xMinRaw * 0.7, xMaxRaw * 1.4] : [0, (xMaxRaw || 0.001) * 1.15];
  const xMid = costs.length ? median(costs) : xMaxRaw / 2;
  const yVals = points.map((p) => p.y);
  let yLo = Math.max(0, Math.floor(((yVals.length ? Math.min(...yVals) : 0) - 8) / 5) * 5);
  let yHi = Math.min(100, Math.ceil(((yVals.length ? Math.max(...yVals) : 100) + 8) / 5) * 5);
  if (yHi - yLo < 15) { yHi = Math.min(100, yLo + 15); if (yHi - yLo < 15) yLo = Math.max(0, yHi - 15); }
  const yBar = Math.round(threshold * 100);
  const sweetX1 = useLog ? xDomain[0] : 0;
  const sweetX2 = Math.min(xMid, xDomain[1]);

  return (
    <section className={`storyboard rise ${running ? 'is-running' : ''}`}>
      <div className="sb-head">
        <span className="eyebrow">Live comparison</span>
        <h3>{scenario.title}</h3>
        <div className="sb-meta">
          <span className="task-chip">{TASK_LABELS[scenario.task_type]}</span>
          <span
            className="sb-scorer-chip"
            title={`${SCORER_INFO[scenario.scorer_type].label} — ${SCORER_INFO[scenario.scorer_type].method}`}
          >
            accuracy: {SCORER_INFO[scenario.scorer_type].label}
          </span>
          <span>{rows.length} model{rows.length === 1 ? '' : 's'}</span>
          {running && <span className="sb-live"><span className="sb-live-dot" /> running…</span>}
          {!running && lastRun && <span>· {new Date(lastRun).toLocaleString()}</span>}
          <MethodologyInfo scenario={scenario} evals={evals} />
        </div>
      </div>

      {/* PRIMARY: the map (fixed area) + SECONDARY: the ranked field */}
      <div className="sb-stage">
        <div className="sb-plot">
          <div className="sb-plot-head">
            <span className="sb-act-label">Accuracy vs. cost — the map</span>
            <span className="sb-plot-hint">cheaper → left · more accurate → up · numbers match the field</span>
          </div>
          <div className="sb-plot-area">
            {points.length >= 1 ? (
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 14, right: 22, bottom: 40, left: 48 }}>
                  <CartesianGrid strokeOpacity={0.3} />
                  <ReferenceArea x1={sweetX1} x2={sweetX2} y1={Math.min(yBar, yHi)} y2={yHi} fill="#15803d" fillOpacity={0.07} stroke="none">
                    <Label value="SWEET SPOT (cheap + accurate)" position="insideTopLeft" style={{ fontSize: 9.5, fontWeight: 700, fill: '#15803d', opacity: 0.65 }} />
                  </ReferenceArea>
                  <XAxis type="number" dataKey="x" scale={useLog ? 'log' : 'linear'} tickFormatter={fmtAxisCost} tick={{ fontSize: 10 }} stroke="#94a3b8" domain={xDomain} allowDataOverflow>
                    <Label value={`Cost per task (USD) — lower is better ←${useLog ? ' (log)' : ''}`} position="insideBottom" offset={-28} style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  </XAxis>
                  <YAxis type="number" dataKey="y" domain={[yLo, yHi]} tick={{ fontSize: 10 }} stroke="#94a3b8" width={34}>
                    <Label value="Accuracy (%) — higher is better →" angle={-90} position="insideLeft" offset={-2} style={{ fontSize: 11, fill: '#64748b', fontWeight: 600, textAnchor: 'middle' }} />
                  </YAxis>
                  <ZAxis range={[120, 120]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<Tip />} />
                  <Scatter
                    data={points}
                    isAnimationActive={false}
                    shape={(props: unknown) => {
                      const { cx, cy, payload } = props as { cx: number; cy: number; payload: { tier: string; anchor: boolean; rank: number } };
                      const c = TIER_COLOR[payload.tier] ?? '#0f62fe';
                      return (
                        <g style={{ pointerEvents: 'all' }}>
                          {payload.anchor && <circle cx={cx} cy={cy} r={13} fill="none" stroke={c} strokeOpacity={0.5} />}
                          <circle cx={cx} cy={cy} r={9} fill={c} stroke="#fff" strokeWidth={1.5} />
                          <text x={cx} y={cy} dy={3.2} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">{payload.rank}</text>
                        </g>
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="sb-empty">Run a live comparison to plot each model by cost and accuracy.</div>
            )}
          </div>
          <div className="sb-legend">
            <span className="legend-item"><span className="tier-dot frontier" /> Frontier</span>
            <span className="legend-item"><span className="tier-dot secondary" /> Secondary</span>
            <span className="legend-item"><span className="tier-dot open_weight" /> Open weight</span>
            <span className="legend-item muted">◯ ring = anchor</span>
          </div>
        </div>

        <div className="sb-field-col">
          <div className="sb-field-head">
            <span className="sb-act-label">Ranked field</span>
            <span className="sb-field-sub">by accuracy · <b>best value</b> = most accuracy per dollar</span>
          </div>
          <div className="sb-bars">
            {ranked.map((r, i) => {
              const pct = Math.round(((r.score ?? 0) / maxScore) * 100);
              const pass = r.score != null ? r.score >= threshold : null;
              const delta = r.score != null && fScore != null && !r.isAnchor ? r.score - fScore : null;
              return (
                <div className={`sb-bar-row ${r.isAnchor ? 'is-anchor' : ''}`} key={r.model.id}>
                  <div className="sb-bar-name">
                    <span className="sb-rank">{i + 1}</span>
                    <span className={`tier-dot ${r.model.tier}`} />
                    <span className="sb-bar-label">{r.model.short_label}</span>
                    {r.isAnchor && <span className="sb-tag sb-tag--anchor" title="Frontier baseline every model is compared against">anchor</span>}
                    {!r.isAnchor && bestValue?.model.id === r.model.id && (
                      <span
                        className="sb-tag sb-tag--best"
                        title={`Best value = most accuracy per dollar (accuracy ÷ cost per task). ${r.model.short_label}: ${fmtScore(r.score ?? 0)} at ${fmtCost(r.cost ?? 0)}/task${bestValueMult ? ` — ${bestValueMult.toFixed(1)}× the anchor's accuracy-per-dollar` : ''}.`}
                      >
                        best value
                      </span>
                    )}
                  </div>
                  <div className="sb-bar-track">
                    <div
                      className="sb-bar-fill"
                      style={{ width: `${r.ok ? pct : 4}%`, background: r.ok ? TIER_COLOR[r.model.tier] : '#be123c' }}
                    />
                  </div>
                  <div className="sb-bar-stats">
                    <span className="sb-bar-score">{r.score != null ? fmtScore(r.score) : r.ok ? '—' : 'err'}</span>
                    {delta != null && <span className={`delta ${delta >= 0 ? 'pos' : delta >= -0.03 ? 'zero' : 'neg'}`}>{fmtDelta(delta)}</span>}
                    <span className="sb-bar-sub">{r.cost != null ? fmtCost(r.cost) : '—'}</span>
                    <span className="sb-bar-sub">{r.latency != null ? fmtMs(r.latency) : '—'}</span>
                    <span className="sb-bar-sub">{r.throughput != null ? `${Math.round(r.throughput)} tok/s` : '—'}</span>
                    {pass != null && <span className={`sb-pass ${pass ? 'ok' : 'no'}`}>{pass ? '✓' : '✗'}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CONTEXT: the ask + the verdict */}
      <div className="sb-context">
        <div className="sb-ctx">
          <span className="sb-ctx-label">The ask</span>
          <p className="sb-ask">{scenario.instruction}</p>
        </div>
        <div className="sb-ctx sb-ctx--verdict">
          <span className="sb-ctx-label">The verdict</span>
          {verdict ? (
            <div className={`sb-verdict sb-verdict--${verdict.tone}`}>
              <span className="sb-verdict-icon">{verdict.icon}</span>
              <span className="sb-verdict-text">
                <strong>{verdict.headline}</strong>
                <span>{verdict.sub}</span>
              </span>
            </div>
          ) : (
            <p className="sb-ask muted">
              {secondaries.length === 0
                ? 'Add a secondary model to compare against the frontier anchor.'
                : 'Run the frontier anchor to anchor the comparison.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; x: number; y: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{p.name}</strong>
      <div>{p.y} score · {fmtCost(p.x)}/task</div>
    </div>
  );
}
