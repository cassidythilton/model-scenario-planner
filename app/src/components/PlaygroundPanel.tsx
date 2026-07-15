import { useEffect, useMemo, useState } from 'react';
import { runScenario } from '../lib/domo';
import { buildRunConfig, hashRunConfig } from '../lib/runConfig';
import { evaluateRun, localScore } from '../lib/scoring';
import { fmtMs } from '../lib/metrics';
import { FRONTIER_CONFIG_ID } from '../data/demoHarness';
import type {
  HarnessEval,
  HarnessRun,
  ModelConfig,
  Scenario,
  SessionRunResult,
} from '../types/harness';
import { BEDROCK_ACCOUNT_REF, TASK_LABELS } from '../types/harness';
import { ModelResultCard, type RunPhase } from './ModelResultCard';
import { RunConsole, type RunEvent } from './RunConsole';
import { OutputView } from './OutputView';
import { LiveStoryboard } from './LiveStoryboard';
import { SCORER_INFO } from '../lib/scorers';
import { Dropdown } from './Dropdown';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface RunState { phase: RunPhase; startedAt: number; }

interface Props {
  scenarios: Scenario[];
  models: ModelConfig[];
  runs: HarnessRun[];
  evals: HarnessEval[];
  onSessionResult: (result: SessionRunResult) => void;
  onRescore?: () => number;
}

const LS_SCENARIO = 'harness.pg.scenario';
const LS_MODELS = 'harness.pg.models';
const readLS = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function PlaygroundPanel({ scenarios, models, runs, evals, onSessionResult, onRescore }: Props) {
  const [rescored, setRescored] = useState<number | null>(null);
  const [scenarioId, setScenarioId] = useState(readLS(LS_SCENARIO) ?? scenarios[0]?.id ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const saved = readLS(LS_MODELS);
    if (saved) { try { const a = JSON.parse(saved); if (Array.isArray(a) && a.length) return a; } catch { /* ignore */ } }
    return [FRONTIER_CONFIG_ID, 'cfg_llama', 'cfg_deepseek'];
  });
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());

  // Persist the playground view so results don't "disappear" on refresh.
  useEffect(() => { writeLS(LS_SCENARIO, scenarioId); }, [scenarioId]);
  useEffect(() => { writeLS(LS_MODELS, JSON.stringify(selectedIds)); }, [selectedIds]);

  // Tick a clock (100ms) only while runs are in flight, for live elapsed timers.
  useEffect(() => {
    if (runningIds.length === 0) return;
    const t = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(t);
  }, [runningIds.length]);

  const pushEvent = (m: ModelConfig, level: RunEvent['level'], text: string) =>
    setEvents((cur) => [...cur, { id: uid(), ts: Date.now(), modelId: m.id, modelLabel: m.short_label, tier: m.tier, level, text }]);
  const setPhase = (id: string, patch: Partial<RunState>) =>
    setRunStates((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { phase: 'queued', startedAt: Date.now() }), ...patch } }));

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  const evalByRun = useMemo(() => new Map(evals.map((e) => [e.run_id, e])), [evals]);

  const latestRunFor = (modelId: string): HarnessRun | undefined => {
    const rs = runs.filter((r) => r.scenario_id === scenario.id && r.model_config_id === modelId);
    if (!rs.length) return undefined;
    return rs.reduce((a, b) => (Date.parse(b.timestamp) >= Date.parse(a.timestamp) ? b : a));
  };

  const frontierScore = useMemo(() => {
    const fe = evals.filter((e) => e.model_config_id === FRONTIER_CONFIG_ID && e.scenario_id === scenario.id);
    return fe.length ? mean(fe.map((e) => e.score)) : undefined;
  }, [evals, scenario.id]);

  const frontierCost = useMemo(() => {
    const fr = runs.filter(
      (r) => r.model_config_id === FRONTIER_CONFIG_ID && r.scenario_id === scenario.id && r.status === 'ok'
    );
    return fr.length ? mean(fr.map((r) => r.cost_usd ?? 0)) : undefined;
  }, [runs, scenario.id]);

  const orderedSelected = models.filter((m) => selectedIds.includes(m.id));

  const runConfigPreview = useMemo(
    () =>
      orderedSelected
        .filter((m) => m.runnable)
        .map((m) => ({ id: m.id, label: m.short_label, hash: hashRunConfig(buildRunConfig(scenario, m, 0)) })),
    [orderedSelected, scenario]
  );

  const toggle = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const runLive = async () => {
    const targets = orderedSelected.filter((m) => m.runnable);
    if (!targets.length) return;
    setRunningIds(targets.map((m) => m.id));
    setEvents([]);
    setRunStates(Object.fromEntries(targets.map((m) => [m.id, { phase: 'queued' as RunPhase, startedAt: Date.now() }])));
    setNowTick(Date.now());
    pushEvent(targets[0], 'muted', `run started · ${scenario.title} · ${targets.length} model${targets.length === 1 ? '' : 's'}`);
    await Promise.all(
      targets.map(async (model, idx) => {
        const runConfig = buildRunConfig(scenario, model, 0);
        const configHash = hashRunConfig(runConfig);
        // Stagger launches so the console reads as a stream rather than a burst.
        await sleep(idx * 180);
        const startedAt = Date.now();
        setPhase(model.id, { phase: 'calling', startedAt });
        pushEvent(model, 'info', `POST /converse · ${model.bedrock_model_id}`);
        try {
          const res = await runScenario({
            scenario: {
              id: scenario.id,
              task_type: scenario.task_type,
              instruction: scenario.instruction,
              input_context: scenario.input_context,
            },
            modelConfig: {
              bedrock_model_id: model.bedrock_model_id,
              path: model.path,
              endpoint: model.endpoint ?? model.path,
              intervention: model.intervention_level,
              params: model.params,
              fewshot_examples: model.fewshot_examples,
              account_ref: BEDROCK_ACCOUNT_REF,
              price_per_1k_input: model.price_per_1k_input,
              price_per_1k_output: model.price_per_1k_output,
            },
            repeatIndex: 0,
            dryRun: false,
          });
          const run: HarnessRun = {
            id: `run_session_${Date.now()}_${model.id}`,
            scenario_id: scenario.id,
            model_config_id: model.id,
            repeat_index: 0,
            status: res.status,
            output_text: res.run?.output_text,
            resolved_prompt: res.run?.resolved_prompt,
            model_id_resolved: res.run?.model_id_resolved,
            input_tokens: res.run?.input_tokens,
            output_tokens: res.run?.output_tokens,
            latency_ms: res.run?.latency_ms,
            cost_usd: res.run?.cost_usd,
            config_hash: configHash,
            request_id: res.run?.request_id ?? null,
            timestamp: res.run?.timestamp ?? new Date().toISOString(),
            error: res.error,
          };
          if (res.status === 'ok') {
            const tok = run.output_tokens ?? 0;
            pushEvent(model, 'success', `200 · ${fmtMs(run.latency_ms ?? 0)} · ${tok} tok${run.request_id ? ` · req ${String(run.request_id).slice(-10)}` : ''}`);
          } else {
            pushEvent(model, 'error', `${res.status} · ${res.error ?? 'failed'}`);
          }
          setPhase(model.id, { phase: 'scoring' });
          const evaluation = await evaluateRun(scenario, run);
          pushEvent(model, res.status === 'ok' ? 'success' : 'muted', `scored ${Math.round(evaluation.score * 100)}${evaluation.needs_human_review ? ' · review' : ''}`);
          onSessionResult({ run, eval: evaluation });
          setPhase(model.id, { phase: res.status === 'ok' ? 'done' : 'error' });
        } catch (err) {
          const run: HarnessRun = {
            id: `run_session_${Date.now()}_${model.id}`,
            scenario_id: scenario.id,
            model_config_id: model.id,
            repeat_index: 0,
            status: 'error',
            config_hash: configHash,
            timestamp: new Date().toISOString(),
            error:
              err instanceof Error
                ? `${err.message} — if testing locally, open the app inside Domo so it can reach Code Engine.`
                : 'Code Engine call failed.',
          };
          pushEvent(model, 'error', err instanceof Error ? err.message : 'Code Engine call failed');
          onSessionResult({ run, eval: localScore(scenario, run) });
          setPhase(model.id, { phase: 'error' });
        } finally {
          setRunningIds((cur) => cur.filter((x) => x !== model.id));
        }
      })
    );
  };

  return (
    <div className="pg-layout">
      <aside className="pg-left">
        <div className="card card-pad">
          <span className="field-label">Scenario</span>
          <Dropdown
            ariaLabel="Scenario"
            searchable
            value={scenarioId}
            onChange={setScenarioId}
            options={scenarios.map((s) => ({ value: s.id, label: s.title, hint: TASK_LABELS[s.task_type] }))}
          />

          <div className="brief" style={{ marginTop: 16 }}>
            <div className="brief-head">
              <span className="brief-archetype">{scenario.archetype}</span>
              <span className="task-chip">{TASK_LABELS[scenario.task_type]}</span>
              <span className="difficulty" title={`Difficulty ${scenario.difficulty}/3`}>
                {[1, 2, 3].map((d) => (
                  <i key={d} className={d <= scenario.difficulty ? 'on' : ''} />
                ))}
              </span>
            </div>
            <h3>{scenario.title}</h3>
            <div className="brief-block">
              <span className="field-label">Instruction</span>
              <div className="brief-instruction">{scenario.instruction}</div>
            </div>
            <div className="brief-block">
              <span className="field-label">Input (anonymized)</span>
              <div className="brief-context"><OutputView text={scenario.input_context} humanize /></div>
            </div>
            <div className="brief-block">
              <span
                className="field-label"
                title={`${SCORER_INFO[scenario.scorer_type].label} — ${SCORER_INFO[scenario.scorer_type].method}`}
              >
                Gold answer · {SCORER_INFO[scenario.scorer_type].label}
              </span>
              <div className="brief-gold"><OutputView text={scenario.gold_answer} humanize /></div>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <span className="field-label">Models</span>
          <div className="select-all">
            <button onClick={() => setSelectedIds(models.map((m) => m.id))}>Select all</button>
            <span className="sa-sep">·</span>
            <button onClick={() => setSelectedIds([])}>None</button>
            <span className="sa-count">{selectedIds.length}/{models.length}</span>
          </div>
          <div className="model-toggles">
            {models.map((m) => {
              const on = selectedIds.includes(m.id);
              return (
                <button key={m.id} className={`toggle ${on ? 'is-on' : ''}`} onClick={() => toggle(m.id)}>
                  <span className="toggle-check">
                    {on && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="toggle-body">
                    <span className="toggle-title">
                      <span className={`tier-dot ${m.tier}`} />
                      {m.short_label}
                    </span>
                    <span className="toggle-meta">
                      <span>{m.vendor}</span>
                      <span>·</span>
                      <span>{m.runnable ? 'live' : m.status === 'needs_profile' ? 'needs profile' : 'seeded'}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            className="btn-run"
            disabled={runningIds.length > 0 || !orderedSelected.some((m) => m.runnable)}
            onClick={runLive}
          >
            {runningIds.length > 0 ? 'Running live comparison…' : 'Run live comparison'}
          </button>
          <p className="run-note">
            Live runs hit Bedrock via Code Engine and are scored server-side, then persisted.
          </p>

          {onRescore && runs.length > 0 && (
            <button
              className="btn-ghost btn-sm btn-rescore"
              onClick={() => { const n = onRescore(); setRescored(n); setTimeout(() => setRescored(null), 2500); }}
              title="Recompute scores from saved output — no new Bedrock calls"
            >
              {rescored != null ? `Re-scored ${rescored} run${rescored === 1 ? '' : 's'} ✓` : 'Re-score saved results'}
            </button>
          )}

          {runConfigPreview.length > 0 && (
            <details className="runconfig">
              <summary>RunConfig · {runConfigPreview.length} live {runConfigPreview.length === 1 ? 'model' : 'models'}</summary>
              <ul className="runconfig-list">
                {runConfigPreview.map((rc) => (
                  <li key={rc.id}>
                    <span>{rc.label}</span>
                    <code title="config_hash — reproducibility + cache key">{rc.hash}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </aside>

      <main>
        <LiveStoryboard
          scenario={scenario}
          models={orderedSelected}
          runs={runs}
          evals={evals}
          running={runningIds.length > 0}
        />

        <RunConsole events={events} running={runningIds.length > 0} />

        <div className="compare-grid">
          {orderedSelected.map((model) => {
            const run = latestRunFor(model.id);
            const evaluation = run ? evalByRun.get(run.id) : undefined;
            const isAnchor = model.id === FRONTIER_CONFIG_ID;
            const rs = runStates[model.id];
            return (
              <ModelResultCard
                key={model.id}
                model={model}
                scenario={scenario}
                run={run}
                evaluation={evaluation}
                frontierScore={frontierScore}
                frontierCost={frontierCost}
                isAnchor={isAnchor}
                isRunning={runningIds.includes(model.id)}
                phase={rs?.phase}
                startedAt={rs?.startedAt}
                nowTick={nowTick}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
