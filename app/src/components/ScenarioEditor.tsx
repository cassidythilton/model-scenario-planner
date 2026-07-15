import { useState } from 'react';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';
import type { Scenario, ScorerType, TaskType } from '../types/harness';
import { TASK_LABELS } from '../types/harness';

const TASK_TYPES: TaskType[] = [
  'classification', 'extraction', 'structured_output', 'rag_qa',
  'summarization', 'reasoning_multistep', 'agentic',
];
const SCORERS: ScorerType[] = ['exact', 'label', 'structured_field', 'reference_similarity'];

interface Props {
  scenario?: Scenario;
  onSave: (scenario: Scenario) => void;
  onClose: () => void;
}

const blank: Scenario = {
  id: '',
  title: '',
  archetype: '',
  task_type: 'classification',
  difficulty: 2,
  instruction: '',
  input_context: '',
  gold_answer: '',
  scorer_type: 'label',
  source: 'synthetic',
  split: 'train',
  tags: [],
};

export function ScenarioEditor({ scenario, onSave, onClose }: Props) {
  const [form, setForm] = useState<Scenario>(scenario ?? blank);
  const [tagsText, setTagsText] = useState((scenario?.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Scenario>(k: K, v: Scenario[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.title.trim() || !form.instruction.trim()) {
      setError('Title and instruction are required.');
      return;
    }
    if (form.source === 'anonymized_real' && !(form.source_ref ?? '').trim()) {
      setError('Anonymized-real scenarios need a source_ref (the anonymized handle, e.g. gong_call_anon_0142).');
      return;
    }
    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    const id = form.id || `scn_${Date.now().toString(36)}`;
    onSave({ ...form, id, tags });
  };

  return (
    <Modal
      title={scenario ? 'Edit scenario' : 'New scenario'}
      onClose={onClose}
      wide
      footer={
        <>
          {error && <span className="form-error">{error}</span>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>{scenario ? 'Save changes' : 'Create scenario'}</button>
        </>
      }
    >
      <div className="anon-notice">
        <strong>Anonymize before pasting.</strong> Raw transcripts must never be entered here. Replace
        identifiers with stable tokens — <code>[CUSTOMER]</code>, <code>[REP]</code>, <code>[COMPANY_A]</code>,
        <code>[EMAIL]</code>, <code>[$AMOUNT]</code> — consistently within the scenario.
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Title</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Q3 renewal — next steps" />
        </label>
        <label className="field">
          <span>Archetype</span>
          <input value={form.archetype} onChange={(e) => set('archetype', e.target.value)} placeholder="Action items" />
        </label>
        <label className="field">
          <span>Task type</span>
          <Dropdown
            value={form.task_type}
            onChange={(v) => set('task_type', v as TaskType)}
            options={TASK_TYPES.map((t) => ({ value: t, label: TASK_LABELS[t] }))}
          />
        </label>
        <label className="field">
          <span>Scorer</span>
          <Dropdown
            value={form.scorer_type}
            onChange={(v) => set('scorer_type', v as ScorerType)}
            options={SCORERS.map((s) => ({ value: s, label: s }))}
          />
        </label>
        <label className="field">
          <span>Difficulty</span>
          <Dropdown
            value={String(form.difficulty)}
            onChange={(v) => set('difficulty', Number(v) as Scenario['difficulty'])}
            options={[
              { value: '1', label: '1 — easy' },
              { value: '2', label: '2 — medium' },
              { value: '3', label: '3 — hard' },
            ]}
          />
        </label>
        <label className="field">
          <span>Source</span>
          <Dropdown
            value={form.source}
            onChange={(v) => set('source', v as Scenario['source'])}
            options={[
              { value: 'synthetic', label: 'synthetic' },
              { value: 'anonymized_real', label: 'anonymized_real' },
            ]}
          />
        </label>
        <label className="field">
          <span>Source ref (anonymized handle)</span>
          <input value={form.source_ref ?? ''} onChange={(e) => set('source_ref', e.target.value)} placeholder="gong_call_anon_0142" />
        </label>
        <label className="field">
          <span>Split</span>
          <Dropdown
            value={form.split ?? 'train'}
            onChange={(v) => set('split', v as Scenario['split'])}
            options={[
              { value: 'train', label: 'train' },
              { value: 'holdout', label: 'holdout' },
            ]}
          />
        </label>
      </div>

      <label className="field">
        <span>Instruction</span>
        <textarea rows={2} value={form.instruction} onChange={(e) => set('instruction', e.target.value)} placeholder="Extract all committed next steps with owner and due date." />
      </label>
      <label className="field">
        <span>Input context (anonymized)</span>
        <textarea rows={4} value={form.input_context} onChange={(e) => set('input_context', e.target.value)} placeholder="[CUSTOMER] asked [REP] to send the pricing worksheet by Friday…" />
      </label>
      <label className="field">
        <span>Gold answer</span>
        <textarea rows={3} value={form.gold_answer} onChange={(e) => set('gold_answer', e.target.value)} placeholder='[{"action":"Send pricing worksheet","owner":"[REP]","due_date":"Friday"}]' />
      </label>
      <label className="field">
        <span>Tags (comma-separated)</span>
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="renewal, multistakeholder" />
      </label>
    </Modal>
  );
}
