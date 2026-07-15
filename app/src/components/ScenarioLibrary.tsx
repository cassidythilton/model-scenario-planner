import { useRef, useState } from 'react';
import { FRONTIER_CONFIG_ID } from '../data/demoHarness';
import { fmtDelta } from '../lib/metrics';
import { exportScenariosCsv, exportScenariosJson, parseScenariosJson } from '../lib/io';
import type { HarnessEval, Scenario, ScenarioSet } from '../types/harness';
import { TASK_LABELS } from '../types/harness';
import { ScenarioEditor } from './ScenarioEditor';
import { Modal } from './Modal';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

interface Props {
  scenarios: Scenario[];
  evals: HarnessEval[];
  scenarioSets: ScenarioSet[];
  onSaveScenario: (s: Scenario) => void;
  onDeleteScenario: (id: string) => void;
  onImportScenarios: (s: Scenario[]) => void;
  onSaveSet: (set: ScenarioSet) => void;
  onDeleteSet: (id: string) => void;
}

/** Per-scenario gap status: best secondary vs frontier on that scenario. */
function gapFor(scenario: Scenario, evals: HarnessEval[]) {
  const sEvals = evals.filter((e) => e.scenario_id === scenario.id);
  const frontier = mean(sEvals.filter((e) => e.model_config_id === FRONTIER_CONFIG_ID).map((e) => e.score));
  const secondaryByModel = new Map<string, number[]>();
  for (const e of sEvals) {
    if (e.model_config_id === FRONTIER_CONFIG_ID) continue;
    const arr = secondaryByModel.get(e.model_config_id) ?? [];
    arr.push(e.score);
    secondaryByModel.set(e.model_config_id, arr);
  }
  const bestSecondary = Math.max(0, ...[...secondaryByModel.values()].map((arr) => mean(arr)));
  return { gap: frontier - bestSecondary, frontier, hasData: sEvals.length > 0 };
}

export function ScenarioLibrary({
  scenarios, evals, scenarioSets,
  onSaveScenario, onDeleteScenario, onImportScenarios, onSaveSet, onDeleteSet,
}: Props) {
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null);
  const [setEditing_, setSetEditing] = useState<ScenarioSet | 'new' | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    try {
      const parsed = parseScenariosJson(await file.text());
      onImportScenarios(parsed);
      setImportErr(null);
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <div>
      <div className="lib-head">
        <span className="eyebrow">Scenario library</span>
        <h2>Sales-call archetypes, spanning the easy → hard boundary</h2>
        <p>
          Each scenario maps a recurring sales-call moment to a task type and scorer. The set is
          deliberately built so the gap-closing boundary is visible, not averaged away.
        </p>
        <div className="lib-actions">
          <button className="btn-primary" onClick={() => setEditing('new')}>New scenario</button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className="btn-ghost" onClick={() => exportScenariosJson(scenarios)}>Export JSON</button>
          <button className="btn-ghost" onClick={() => exportScenariosCsv(scenarios)}>Export CSV</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = ''; }}
          />
        </div>
        {importErr && <span className="form-error">{importErr}</span>}
      </div>

      {/* ── Scenario sets ── */}
      <div className="sets-bar">
        <div className="sets-bar-head">
          <span className="eyebrow">Scenario sets</span>
          <button className="btn-ghost btn-sm" onClick={() => setSetEditing('new')}>New set</button>
        </div>
        <div className="sets-list">
          {scenarioSets.length === 0 && <span className="muted">No sets yet — group scenarios into reusable batches.</span>}
          {scenarioSets.map((set) => (
            <div className="set-chip" key={set.id}>
              <span className="set-name">{set.name}</span>
              <span className="set-count">{set.scenario_ids.length}</span>
              <button className="set-edit" onClick={() => setSetEditing(set)} title="Edit set">✎</button>
              <button className="set-edit danger" onClick={() => onDeleteSet(set.id)} title="Delete set">×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="lib-grid">
        {scenarios.map((s) => {
          const { gap, frontier, hasData } = gapFor(s, evals);
          const status = !hasData ? 'partial' : gap <= 0.03 ? 'holds' : gap <= 0.07 ? 'partial' : 'breaks';
          const statusLabel = !hasData ? 'No runs yet' : status === 'holds' ? 'Gap closes' : status === 'partial' ? 'Within range' : 'Gap persists';
          return (
            <div className="card lib-card rise" key={s.id}>
              <div className="lib-card-head">
                <span className="eyebrow">{s.archetype}</span>
                <span className="difficulty" title={`Difficulty ${s.difficulty}/3`}>
                  {[1, 2, 3].map((d) => (
                    <i key={d} className={d <= s.difficulty ? 'on' : ''} />
                  ))}
                </span>
              </div>
              <h3>{s.title}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="task-chip">{TASK_LABELS[s.task_type]}</span>
                <span className="task-chip">{s.scorer_type}</span>
                <span className="task-chip">{s.source === 'anonymized_real' ? 'anonymized' : 'synthetic'}</span>
                {s.split === 'holdout' && <span className="task-chip">holdout</span>}
              </div>
              <div className="lib-context">{s.input_context}</div>
              <div className="lib-foot">
                <span className={`gap-status ${status}`}>{statusLabel}</span>
                <span className="lib-foot-right">
                  {hasData && (
                    <span className="muted mono" style={{ fontSize: 11 }}>
                      anchor {Math.round(frontier * 100)} · gap {fmtDelta(-gap)}
                    </span>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
                  <button className="btn-ghost btn-sm danger" onClick={() => onDeleteScenario(s.id)} title="Delete scenario">Delete</button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <ScenarioEditor
          scenario={editing === 'new' ? undefined : editing}
          onSave={(s) => { onSaveScenario(s); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}

      {setEditing_ && (
        <ScenarioSetBuilder
          set={setEditing_ === 'new' ? undefined : setEditing_}
          scenarios={scenarios}
          onSave={(set) => { onSaveSet(set); setSetEditing(null); }}
          onClose={() => setSetEditing(null)}
        />
      )}
    </div>
  );
}

function ScenarioSetBuilder({
  set, scenarios, onSave, onClose,
}: {
  set?: ScenarioSet;
  scenarios: Scenario[];
  onSave: (set: ScenarioSet) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(set?.name ?? '');
  const [description, setDescription] = useState(set?.description ?? '');
  const [ids, setIds] = useState<string[]>(set?.scenario_ids ?? []);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!ids.length) { setError('Select at least one scenario.'); return; }
    onSave({ id: set?.id || `set_${Date.now().toString(36)}`, name: name.trim(), description: description.trim(), scenario_ids: ids });
  };

  return (
    <Modal
      title={set ? 'Edit set' : 'New scenario set'}
      onClose={onClose}
      footer={
        <>
          {error && <span className="form-error">{error}</span>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>{set ? 'Save set' : 'Create set'}</button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Renewal scout set" />
      </label>
      <label className="field">
        <span>Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Easy→hard span for the scout pass" />
      </label>
      <span className="field-label">Scenarios ({ids.length} selected)</span>
      <div className="select-all">
        <button onClick={() => setIds(scenarios.map((s) => s.id))}>Select all</button>
        <span className="sa-sep">·</span>
        <button onClick={() => setIds([])}>None</button>
        <span className="sa-count">{ids.length}/{scenarios.length}</span>
      </div>
      <div className="set-picker">
        {scenarios.map((s) => (
          <label key={s.id} className={`set-pick ${ids.includes(s.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={ids.includes(s.id)} onChange={() => toggle(s.id)} />
            <span>{s.title}</span>
            <span className="task-chip">{TASK_LABELS[s.task_type]}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
