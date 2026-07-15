import { useEffect, useMemo, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { PlaygroundPanel } from './components/PlaygroundPanel';
import { ResultsMap } from './components/ResultsMap';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { ModelRegistry } from './components/ModelRegistry';
import { BatchRunner } from './components/BatchRunner';
import { bootstrap, type HarnessData } from './lib/bootstrap';
import { deleteById, saveEval, saveRun, upsertById } from './lib/repos';
import { computeMetrics } from './lib/metrics';
import { localScore } from './lib/scoring';
import type {
  Batch,
  HarnessEval,
  HarnessRun,
  ModelConfig,
  Scenario,
  ScenarioSet,
  SessionRunResult,
} from './types/harness';

type AppView = 'playground' | 'results' | 'scenarios' | 'models' | 'batches';

const upsert = <T extends { id: string }>(arr: T[], item: T): T[] => {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i === -1) return [...arr, item];
  const next = [...arr];
  next[i] = item;
  return next;
};

export default function App() {
  const [view, setView] = useState<AppView>('playground');
  const [data, setData] = useState<HarnessData | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [scenarioSets, setScenarioSets] = useState<ScenarioSet[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sessionRuns, setSessionRuns] = useState<HarnessRun[]>([]);
  const [sessionEvals, setSessionEvals] = useState<HarnessEval[]>([]);

  useEffect(() => {
    let alive = true;
    bootstrap().then((d) => {
      if (!alive) return;
      setData(d);
      setScenarios(d.scenarios);
      setModels(d.models);
      setScenarioSets(d.scenarioSets);
      setBatches(d.batches);
    });
    return () => { alive = false; };
  }, []);

  const isDb = data?.source === 'appdb';
  const persist = (fn: () => Promise<unknown>) => { if (isDb) void fn().catch(() => {}); };

  const baseRuns = data?.runs ?? [];
  const baseEvals = data?.evals ?? [];
  const runs = useMemo(() => [...baseRuns, ...sessionRuns], [baseRuns, sessionRuns]);
  const evals = useMemo(() => [...baseEvals, ...sessionEvals], [baseEvals, sessionEvals]);
  const ctx = useMemo(
    () => computeMetrics(models, scenarios, runs, evals),
    [models, scenarios, runs, evals]
  );

  const addResult = ({ run, eval: evaluation }: SessionRunResult) => {
    setSessionRuns((cur) => [...cur, run]);
    setSessionEvals((cur) => [...cur, evaluation]);
    persist(() => saveRun(run));
    persist(() => saveEval(evaluation));
  };

  // Re-score already-persisted runs from their stored output (no new Bedrock
  // calls) using the current graded scorer. Fixes historical flat-zero evals.
  const rescoreRuns = (): number => {
    const scById = new Map(scenarios.map((s) => [s.id, s]));
    const updated: HarnessEval[] = [];
    runs.forEach((run) => {
      const sc = scById.get(run.scenario_id);
      if (sc) updated.push(localScore(sc, run));
    });
    if (!updated.length) return 0;
    setSessionEvals((cur) => {
      const byRun = new Map<string, HarnessEval>();
      [...cur, ...updated].forEach((e) => byRun.set(e.run_id, e));
      return Array.from(byRun.values());
    });
    updated.forEach((e) => persist(() => upsertById('evals', e)));
    return updated.length;
  };

  // ── Authoring mutations (V2) ──
  const saveScenario = (s: Scenario) => { setScenarios((cur) => upsert(cur, s)); persist(() => upsertById('scenarios', s)); };
  const deleteScenario = (id: string) => { setScenarios((cur) => cur.filter((x) => x.id !== id)); persist(() => deleteById('scenarios', id)); };
  const importScenarios = (arr: Scenario[]) => { setScenarios((cur) => arr.reduce(upsert, cur)); arr.forEach((s) => persist(() => upsertById('scenarios', s))); };
  const saveModel = (m: ModelConfig) => { setModels((cur) => upsert(cur, m)); persist(() => upsertById('modelConfigs', m)); };
  const deleteModel = (id: string) => { setModels((cur) => cur.filter((x) => x.id !== id)); persist(() => deleteById('modelConfigs', id)); };
  const saveSet = (set: ScenarioSet) => { setScenarioSets((cur) => upsert(cur, set)); persist(() => upsertById('scenarioSets', set)); };
  const deleteSet = (id: string) => { setScenarioSets((cur) => cur.filter((x) => x.id !== id)); persist(() => deleteById('scenarioSets', id)); };
  const saveBatch = (b: Batch) => { setBatches((cur) => upsert(cur, b)); persist(() => upsertById('batches', b)); };

  const tabs: { id: AppView; label: string; count?: number }[] = [
    { id: 'playground', label: 'Playground' },
    { id: 'results', label: 'Results map' },
    { id: 'scenarios', label: 'Scenarios', count: scenarios.length },
    { id: 'models', label: 'Models', count: models.length },
    { id: 'batches', label: 'Batches', count: batches.length || undefined },
  ];

  if (!data) {
    return (
      <div className="app">
        <div className="content">
          <p style={{ padding: 24, color: 'var(--muted, #888)' }}>Loading harness…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Market-Fit Harness</h1>
            <div className="sub">Cost vs. accuracy for secondary models</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary views">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${view === t.id ? 'is-active' : ''}`}
              onClick={() => setView(t.id)}
            >
              {t.label}
              {t.count != null && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <span className="env-pill">
            <span className="env-dot" />
            Bedrock · us-east-2
          </span>
        </div>
      </header>

      <div className="content">
        <div style={{ display: view === 'playground' ? 'block' : 'none' }}>
          <PlaygroundPanel
            scenarios={scenarios}
            models={models}
            runs={runs}
            evals={evals}
            onSessionResult={addResult}
            onRescore={rescoreRuns}
          />
        </div>
        <div style={{ display: view === 'results' ? 'block' : 'none' }}>
          <ResultsMap ctx={ctx} scenarios={scenarios} configs={models} runs={runs} evals={evals} onRescore={rescoreRuns} />
        </div>
        <div style={{ display: view === 'scenarios' ? 'block' : 'none' }}>
          <ScenarioLibrary
            scenarios={scenarios}
            evals={evals}
            scenarioSets={scenarioSets}
            onSaveScenario={saveScenario}
            onDeleteScenario={deleteScenario}
            onImportScenarios={importScenarios}
            onSaveSet={saveSet}
            onDeleteSet={deleteSet}
          />
        </div>
        <div style={{ display: view === 'models' ? 'block' : 'none' }}>
          <ModelRegistry models={models} onSave={saveModel} onDelete={deleteModel} />
        </div>
        <div style={{ display: view === 'batches' ? 'block' : 'none' }}>
          <BatchRunner
            scenarios={scenarios}
            models={models}
            scenarioSets={scenarioSets}
            batches={batches}
            runs={runs}
            evals={evals}
            onResult={addResult}
            onSaveBatch={saveBatch}
          />
        </div>
      </div>
    </div>
  );
}
