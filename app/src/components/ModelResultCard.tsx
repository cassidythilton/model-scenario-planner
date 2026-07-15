import type { HarnessEval, HarnessRun, ModelConfig, Scenario } from '../types/harness';
import { TASK_LABELS, TASK_THRESHOLDS, TIER_LABELS } from '../types/harness';
import { fmtCost, fmtDelta, fmtMs, fmtScore } from '../lib/metrics';
import { SCORER_INFO, graderLabel } from '../lib/scorers';
import { OutputView } from './OutputView';

export type RunPhase = 'queued' | 'calling' | 'scoring' | 'done' | 'error';

const PHASE_TEXT: Record<RunPhase, string> = {
  queued: 'Queued — waiting for a slot…',
  calling: 'Calling Bedrock through Code Engine…',
  scoring: 'Response received — scoring output…',
  done: '',
  error: '',
};

function relTime(ts?: string): string {
  if (!ts) return '';
  const d = Date.parse(ts);
  if (Number.isNaN(d)) return '';
  const s = Math.max(0, Math.round((Date.now() - d) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
}

const fmtElapsed = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.max(0, Math.round(ms))}ms`);

interface Props {
  model: ModelConfig;
  scenario: Scenario;
  run?: HarnessRun;
  evaluation?: HarnessEval;
  frontierScore?: number;
  frontierCost?: number;
  isAnchor?: boolean;
  isRunning?: boolean;
  phase?: RunPhase;
  startedAt?: number;
  nowTick?: number;
}

export function ModelResultCard({
  model,
  scenario,
  run,
  evaluation,
  frontierScore,
  frontierCost,
  isAnchor,
  isRunning,
  phase,
  startedAt,
  nowTick,
}: Props) {
  const status = isRunning ? 'running' : run?.status ?? model.status;
  const score = evaluation?.score;
  const threshold = TASK_THRESHOLDS[scenario.task_type];
  const pass = score != null ? score >= threshold : null;
  const delta = score != null && frontierScore != null && !isAnchor ? score - frontierScore : undefined;
  const costMult =
    run?.cost_usd && frontierCost && run.cost_usd > 0 && !isAnchor ? frontierCost / run.cost_usd : undefined;

  // Throughput (tok/s) — derived from output tokens over total wall-clock latency.
  const outTok = run?.output_tokens ?? 0;
  const throughput = run?.latency_ms && run.latency_ms > 0 && outTok > 0 ? outTok / (run.latency_ms / 1000) : null;
  // Normalized cost: $ per 1k output tokens actually generated.
  const costPer1k = run?.cost_usd != null && outTok > 0 ? run.cost_usd / (outTok / 1000) : null;

  const elapsedMs = isRunning && startedAt && nowTick ? nowTick - startedAt : null;
  const livePhase: RunPhase = phase ?? 'calling';

  return (
    <article className={`result ${isAnchor ? 'is-anchor' : ''} ${isRunning ? 'is-live' : ''}`}>
      <div className="result-top">
        <div className="row">
          <div>
            <div className="result-name">
              <span className={`tier-dot ${model.tier}`} />
              {model.short_label}
            </div>
            <div className="result-vendor">
              {model.vendor} · {TIER_LABELS[model.tier]}
            </div>
          </div>
          {isRunning ? (
            <span className="status-pill status-pill--running run-elapsed">
              <span className="run-spinner" />
              {elapsedMs != null ? fmtElapsed(elapsedMs) : 'running'}
            </span>
          ) : (
            <span className={`status-pill status-pill--${status}`}>{String(status)}</span>
          )}
        </div>
      </div>

      <div className="result-context">
        <span className="task-chip">{TASK_LABELS[scenario.task_type]}</span>
        <span
          className="rc-scorer"
          title={`${SCORER_INFO[scenario.scorer_type].label} — ${SCORER_INFO[scenario.scorer_type].method}`}
        >
          {SCORER_INFO[scenario.scorer_type].label}
        </span>
        {pass != null && (
          <span className={`rc-verdict ${pass ? 'is-pass' : 'is-fail'}`} title={`Threshold ${Math.round(threshold * 100)}`}>
            {pass ? '✓ meets bar' : '✗ below bar'}
          </span>
        )}
      </div>

      <div className="result-output" key={run?.id ?? 'empty'}>
        {isRunning ? (
          <span className="ph phase-line">
            <span className="phase-pulse" />
            {PHASE_TEXT[livePhase] || 'Working…'}
          </span>
        ) : run?.error ? (
          <span className="bad-text reveal">{run.error}</span>
        ) : run?.output_text ? (
          <div className="reveal"><OutputView text={run.output_text} /></div>
        ) : (
          <span className="ph">No run yet for this scenario — run a live comparison to populate it.</span>
        )}
      </div>

      {run && !isRunning && (run.output_text || run.resolved_prompt) && (
        <div className="result-context-more">
          <details className="ctx-fold">
            <summary>Prompt sent</summary>
            <pre className="ctx-pre">{run.resolved_prompt || `${scenario.instruction}\n\n${scenario.input_context}`}</pre>
          </details>
          <details className="ctx-fold">
            <summary>Gold answer · {scenario.scorer_type}</summary>
            <pre className="ctx-pre">{scenario.gold_answer}</pre>
          </details>
        </div>
      )}

      <div className="result-metrics">
        <div className="rm">
          <div className="rm-label">Quality</div>
          <div className="rm-value">
            {score != null ? fmtScore(score) : '—'}
            {delta != null && (
              <span className={`delta ${delta >= 0 ? 'pos' : delta >= -0.03 ? 'zero' : 'neg'}`}>
                {fmtDelta(delta)}
              </span>
            )}
          </div>
          <div className="scorebar">
            <i style={{ width: `${Math.round((score ?? 0) * 100)}%` }} />
          </div>
        </div>

        <div className="rm">
          <div className="rm-label">Cost / task</div>
          <div className="rm-value">{run?.cost_usd != null ? fmtCost(run.cost_usd) : '—'}</div>
          <div className="rm-sub">
            {isAnchor ? 'anchor baseline' : costMult ? `${costMult.toFixed(1)}× cheaper` : 'cost basis'}
          </div>
        </div>

        <div className="rm">
          <div className="rm-label">Throughput</div>
          <div className="rm-value">{throughput != null ? `${Math.round(throughput)}` : '—'}<span className="rm-unit"> tok/s</span></div>
          <div className="rm-sub">{outTok ? `${outTok} output tokens` : 'tokens/sec'}</div>
        </div>

        <div className="rm">
          <div className="rm-label">Latency <span className="rm-hint" title="Total wall-clock — the broker is non-streaming, so this is not TTFT">(total)</span></div>
          <div className="rm-value">{run?.latency_ms != null ? fmtMs(run.latency_ms) : '—'}</div>
          <div className="rm-sub">{run?.is_demo ? 'seeded' : run ? 'live session' : '—'}</div>
        </div>
      </div>

      {run && !isRunning && (
        <div className="result-foot">
          <div className="result-foot-line">
            <span className="result-foot-dot" />
            Last run {relTime(run.timestamp)}
            {run.timestamp && (
              <span className="result-foot-abs" title={new Date(run.timestamp).toLocaleString()}>
                · {new Date(run.timestamp).toLocaleString()}
              </span>
            )}
          </div>
          <div className="result-foot-chips">
            <span className="rf-chip" title="Input · output tokens">{run.input_tokens ?? 0} in · {outTok} out</span>
            {costPer1k != null && <span className="rf-chip" title="Normalized cost per 1k output tokens">{fmtCost(costPer1k)}/1k out</span>}
            {run.request_id && (
              <span className="rf-chip rf-req" title="Bedrock request-id — reconcile against CloudWatch">req {String(run.request_id).slice(-10)}</span>
            )}
            {evaluation?.scorer_version && (
              <span className="rf-chip" title="How this accuracy score was computed">graded by {graderLabel(evaluation.scorer_version)}</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
