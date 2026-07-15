import { useMemo, useRef, useState } from 'react';
import { estimateGrid, expandGrid, runBatch, scenariosForSets } from '../lib/batch';
import { fmtCost } from '../lib/metrics';
import { Dropdown } from './Dropdown';
import {
  COST_CEILING_USD,
  TASK_LABELS,
  TASK_THRESHOLDS,
  type Batch,
  type BatchStage,
  type HarnessEval,
  type HarnessRun,
  type ModelConfig,
  type Scenario,
  type ScenarioSet,
  type SessionRunResult,
  type TaskType,
} from '../types/harness';

interface Props {
  scenarios: Scenario[];
  models: ModelConfig[];
  scenarioSets: ScenarioSet[];
  batches: Batch[];
  runs: HarnessRun[];
  evals: HarnessEval[];
  onResult: (r: SessionRunResult) => void;
  onSaveBatch: (b: Batch) => void;
}

export function BatchRunner({ scenarios, models, scenarioSets, batches, runs, evals, onResult, onSaveBatch }: Props) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState<BatchStage>('scout');
  const [setIds, setSetIds] = useState<string[]>([]);
  const [modelIds, setModelIds] = useState<string[]>(models.filter((m) => m.runnable).map((m) => m.id));
  const [cacheMode, setCacheMode] = useState(false);
  const [thresholds, setThresholds] = useState<Partial<Record<TaskType, number>>>({});
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; failed: number; total: number; cost: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stopRef = useRef(false);

  const nRepeats = stage === 'scout' ? 1 : 3;
  const selScenarios = useMemo(() => scenariosForSets(setIds, scenarioSets, scenarios), [setIds, scenarioSets, scenarios]);
  const selModels = useMemo(() => models.filter((m) => modelIds.includes(m.id)), [models, modelIds]);
  const cells = useMemo(() => expandGrid(selScenarios, selModels, nRepeats), [selScenarios, selModels, nRepeats]);
  const estimate = useMemo(() => estimateGrid(cells), [cells]);
  const presentTasks = useMemo(
    () => [...new Set(selScenarios.map((s) => s.task_type))],
    [selScenarios]
  );
  const overCeiling = estimate.cost > COST_CEILING_USD;
  const canLaunch = !running && cells.length > 0 && !overCeiling;

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const doLaunch = async () => {
    if (!canLaunch) return;
    setConfirming(false);

    const preregistered_thresholds: Partial<Record<TaskType, number>> = {};
    presentTasks.forEach((t) => { preregistered_thresholds[t] = thresholds[t] ?? TASK_THRESHOLDS[t]; });

    const batch: Batch = {
      id: `batch_${Date.now().toString(36)}`,
      name: name.trim() || `${stage} ${new Date().toLocaleString()}`,
      scenario_set_ids: setIds,
      model_config_ids: modelIds,
      n_repeats: nRepeats,
      stage,
      preregistered_thresholds,
      cache_mode: cacheMode,
      cost_estimate: estimate.cost,
      cost_actual: 0,
      cost_ceiling: COST_CEILING_USD,
      status: 'running',
      progress: { total: cells.length, completed: 0, failed: 0 },
      created_on: new Date().toISOString(),
    };
    onSaveBatch(batch);
    setRunning(true);
    setNotice(null);
    setProgress({ completed: 0, failed: 0, total: cells.length, cost: 0 });
    stopRef.current = false;

    const result = await runBatch({
      batchId: batch.id,
      cells,
      cacheMode,
      existingRuns: runs,
      existingEvals: evals,
      ceiling: COST_CEILING_USD,
      onResult,
      onProgress: (p) => setProgress(p),
      shouldStop: () => stopRef.current,
    });

    const status: Batch['status'] =
      result.stoppedReason === 'ceiling' ? 'paused' : result.stoppedReason === 'stopped' ? 'paused' : 'done';
    onSaveBatch({
      ...batch,
      status,
      cost_actual: result.cost,
      progress: { total: cells.length, completed: result.completed, failed: result.failed },
    });
    setRunning(false);
    setNotice(
      result.stoppedReason === 'ceiling'
        ? `Stopped at the $${COST_CEILING_USD} ceiling — ${result.completed} runs completed.`
        : result.stoppedReason === 'stopped'
          ? `Paused — ${result.completed} runs completed.`
          : `Done — ${result.completed} ok, ${result.failed} failed, ${fmtCost(result.cost)} spent.`
    );
  };

  return (
    <div>
      <div className="lib-head">
        <span className="eyebrow">Batch runner</span>
        <h2>Mass execution — scout wide, then confirm</h2>
        <p>
          Expand a scenario set × model matrix into a run grid. A pre-flight estimate gates launch and a
          hard ${COST_CEILING_USD} ceiling stops runaway spend. Demo/cache mode replays prior runs at $0.
        </p>
      </div>

      <div className="batch-layout">
        <div className="card card-pad batch-builder">
          <label className="field">
            <span>Batch name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Renewal scout pass" />
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Stage</span>
              <Dropdown
                ariaLabel="Stage"
                value={stage}
                onChange={(v) => setStage(v as BatchStage)}
                options={[
                  { value: 'scout', label: 'scout — N=1, wide' },
                  { value: 'confirm', label: 'confirm — N=3, narrow' },
                ]}
              />
            </label>
            <label className="field field--check">
              <input type="checkbox" checked={cacheMode} onChange={(e) => setCacheMode(e.target.checked)} />
              <span>Demo / cache mode ($0 replay)</span>
            </label>
          </div>

          <span className="field-label">Scenario sets</span>
          {scenarioSets.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>No sets yet — create one in the Scenarios tab.</p>
          ) : (
            <>
            <div className="select-all">
              <button onClick={() => setSetIds(scenarioSets.map((s) => s.id))}>Select all</button>
              <span className="sa-sep">·</span>
              <button onClick={() => setSetIds([])}>None</button>
              <span className="sa-count">{setIds.length}/{scenarioSets.length}</span>
            </div>
            <div className="chk-list">
              {scenarioSets.map((set) => (
                <label key={set.id} className={`chk ${setIds.includes(set.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={setIds.includes(set.id)} onChange={() => toggle(setIds, setSetIds, set.id)} />
                  <span>{set.name}</span>
                  <span className="set-count">{set.scenario_ids.length}</span>
                </label>
              ))}
            </div>
            </>
          )}

          <span className="field-label">Models</span>
          <div className="select-all">
            <button onClick={() => setModelIds(models.map((m) => m.id))}>Select all</button>
            <span className="sa-sep">·</span>
            <button onClick={() => setModelIds([])}>None</button>
            <span className="sa-count">{modelIds.length}/{models.length}</span>
          </div>
          <div className="chk-list">
            {models.map((m) => (
              <label key={m.id} className={`chk ${modelIds.includes(m.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={modelIds.includes(m.id)} onChange={() => toggle(modelIds, setModelIds, m.id)} />
                <span className="tier-dot-inline"><span className={`tier-dot ${m.tier}`} /> {m.short_label}</span>
                <span className="muted" style={{ fontSize: 11 }}>{m.intervention_level}</span>
              </label>
            ))}
          </div>

          {presentTasks.length > 0 && (
            <>
              <span className="field-label">Pre-registered thresholds (match = within)</span>
              <div className="thresh-grid">
                {presentTasks.map((t) => (
                  <label key={t} className="field">
                    <span>{TASK_LABELS[t]}</span>
                    <input
                      type="number" step="0.01" min="0" max="1"
                      value={thresholds[t] ?? TASK_THRESHOLDS[t]}
                      onChange={(e) => setThresholds((cur) => ({ ...cur, [t]: Number(e.target.value) }))}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="batch-side">
          <div className="card card-pad">
            <span className="field-label">Pre-flight</span>
            <div className="preflight">
              <div className="preflight-row"><span>Runs</span><strong>{estimate.runs}</strong></div>
              <div className="preflight-row"><span>Est. tokens</span><strong>{(estimate.inputTokens + estimate.outputTokens).toLocaleString()}</strong></div>
              <div className="preflight-row"><span>Est. cost</span><strong className={overCeiling ? 'over' : ''}>{fmtCost(estimate.cost)}</strong></div>
              <div className="preflight-row"><span>Ceiling</span><strong>${COST_CEILING_USD}</strong></div>
            </div>
            {overCeiling && <p className="form-error">Estimate exceeds the ceiling — narrow the grid.</p>}

            {running && progress && (
              <div className="batch-progress">
                <div className="bar"><div className="bar-fill" style={{ width: `${Math.round((progress.completed + progress.failed) / progress.total * 100)}%` }} /></div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {progress.completed + progress.failed}/{progress.total} · {progress.failed} failed · {fmtCost(progress.cost)}
                </div>
                <button className="btn-ghost btn-sm" onClick={() => { stopRef.current = true; }}>Pause</button>
              </div>
            )}

            {!running && !confirming && (
              <button className="btn-run" disabled={!canLaunch} onClick={() => setConfirming(true)}>
                {cells.length ? `Launch ${stage} (${cells.length} runs)` : 'Select sets + models'}
              </button>
            )}
            {!running && confirming && (
              <div className="batch-confirm">
                <p>Launch {cells.length} runs (~{fmtCost(estimate.cost)})? Hard ceiling ${COST_CEILING_USD}.</p>
                <div className="batch-confirm-actions">
                  <button className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="btn-primary" onClick={doLaunch}>Confirm launch</button>
                </div>
              </div>
            )}
            {notice && <p className="run-note">{notice}</p>}
          </div>
        </aside>
      </div>

      {batches.length > 0 && (
        <div className="batch-history">
          <span className="field-label">Batch history</span>
          <table className="batch-table">
            <thead><tr><th>Name</th><th>Stage</th><th>Status</th><th>Runs</th><th>Cost</th></tr></thead>
            <tbody>
              {[...batches].reverse().map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.stage}</td>
                  <td><span className={`batch-status ${b.status}`}>{b.status}</span></td>
                  <td>{b.progress.completed}/{b.progress.total}{b.progress.failed ? ` (${b.progress.failed} fail)` : ''}</td>
                  <td>{fmtCost(b.cost_actual || b.cost_estimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
