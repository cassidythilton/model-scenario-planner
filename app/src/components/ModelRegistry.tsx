import { useState } from 'react';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';
import { checkSymmetric, makeAnchorVariant } from '../lib/symmetric';
import type { InterventionLevel, ModelConfig, ModelPath, ModelTier } from '../types/harness';
import { TIER_LABELS } from '../types/harness';

const TIERS: ModelTier[] = ['frontier', 'secondary', 'open_weight'];
const INTERVENTIONS: InterventionLevel[] = ['zeroshot', 'fewshot', 'rag', 'finetuned'];

interface Props {
  models: ModelConfig[];
  onSave: (model: ModelConfig) => void;
  onDelete: (id: string) => void;
}

export function ModelRegistry({ models, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<ModelConfig | 'new' | null>(null);

  return (
    <div>
      <div className="lib-head">
        <span className="eyebrow">Model registry</span>
        <h2>Model × intervention configs</h2>
        <p>
          The comparison unit is <strong>model × intervention</strong>, never model alone. Any few-shot / RAG
          config built for a secondary must also exist for the frontier anchor (symmetric control).
        </p>
        <button className="btn-primary" onClick={() => setEditing('new')}>New config</button>
      </div>

      {TIERS.map((tier) => {
        const tierModels = models.filter((m) => m.tier === tier);
        if (!tierModels.length) return null;
        return (
          <div key={tier} className="reg-group">
            <h4 className="reg-tier"><span className={`tier-dot ${tier}`} /> {TIER_LABELS[tier]}</h4>
            <div className="reg-grid">
              {tierModels.map((m) => (
                <div className="card reg-card" key={m.id}>
                  <div className="reg-card-head">
                    <strong>{m.short_label}</strong>
                    <span className="task-chip">{m.intervention_level}</span>
                  </div>
                  <div className="muted mono" style={{ fontSize: 11 }}>{m.bedrock_model_id}</div>
                  <div className="reg-meta">
                    <span>{m.endpoint ?? m.path}</span>
                    <span>·</span>
                    <span>${m.price_per_1k_input}/${m.price_per_1k_output} per 1k</span>
                    <span>·</span>
                    <span>{m.runnable ? 'live' : m.status}</span>
                  </div>
                  <div className="reg-actions">
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(m)}>Edit</button>
                    <button className="btn-ghost btn-sm danger" onClick={() => onDelete(m.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {editing && (
        <ModelEditor
          model={editing === 'new' ? undefined : editing}
          models={models}
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ModelEditor({
  model,
  models,
  onSave,
  onClose,
}: {
  model?: ModelConfig;
  models: ModelConfig[];
  onSave: (m: ModelConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ModelConfig>(
    model ?? {
      id: '',
      label: '',
      short_label: '',
      vendor: '',
      bedrock_model_id: '',
      path: 'runtime',
      endpoint: 'runtime',
      tier: 'secondary',
      intervention_level: 'zeroshot',
      params: { temperature: 0.2, max_tokens: 512 },
      price_per_1k_input: 0,
      price_per_1k_output: 0,
      runnable: true,
      status: 'ready',
    }
  );
  const [warning, setWarning] = useState<string | null>(null);

  const set = <K extends keyof ModelConfig>(k: K, v: ModelConfig[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setParam = (k: 'temperature' | 'max_tokens', v: number) =>
    setForm((f) => ({ ...f, params: { ...f.params, [k]: v } }));

  const finalize = (m: ModelConfig) => {
    const id = m.id || `cfg_${Date.now().toString(36)}`;
    onSave({ ...m, id, endpoint: m.endpoint ?? m.path, short_label: m.short_label || m.label });
    onClose();
  };

  const save = () => {
    if (!form.label.trim() || !form.bedrock_model_id.trim()) {
      setWarning('Label and Bedrock model id are required.');
      return;
    }
    const check = checkSymmetric(models, form);
    if (!check.ok) {
      setWarning(check.message ?? 'Symmetric-control violation.');
      return;
    }
    finalize(form);
  };

  const createAnchorThenSave = () => {
    const anchor = makeAnchorVariant(models, form.intervention_level);
    if (anchor) onSave(anchor);
    finalize(form);
  };

  return (
    <Modal
      title={model ? 'Edit config' : 'New config'}
      onClose={onClose}
      wide
      footer={
        <>
          {warning && <span className="form-error">{warning}</span>}
          {warning && !checkSymmetric(models, form).ok && makeAnchorVariant(models, form.intervention_level) && (
            <button className="btn-ghost" onClick={createAnchorThenSave}>Create matching anchor + save</button>
          )}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>{model ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Label</span>
          <input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="DeepSeek V3.2 — few-shot" />
        </label>
        <label className="field">
          <span>Short label</span>
          <input value={form.short_label} onChange={(e) => set('short_label', e.target.value)} placeholder="DeepSeek V3.2" />
        </label>
        <label className="field">
          <span>Vendor</span>
          <input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="DeepSeek" />
        </label>
        <label className="field">
          <span>Bedrock model id</span>
          <input value={form.bedrock_model_id} onChange={(e) => set('bedrock_model_id', e.target.value)} placeholder="deepseek.v3.2" />
        </label>
        <label className="field">
          <span>Endpoint</span>
          <Dropdown
            value={(form.endpoint ?? form.path) as string}
            onChange={(v) => { set('endpoint', v as ModelPath); set('path', v as ModelPath); }}
            options={[
              { value: 'runtime', label: 'runtime (Claude/Nova/Llama)' },
              { value: 'mantle', label: 'mantle (open-weight)' },
            ]}
          />
        </label>
        <label className="field">
          <span>Tier</span>
          <Dropdown
            value={form.tier}
            onChange={(v) => set('tier', v as ModelTier)}
            options={TIERS.map((t) => ({ value: t, label: TIER_LABELS[t], dotClass: `tier-dot ${t}` }))}
          />
        </label>
        <label className="field">
          <span>Intervention</span>
          <Dropdown
            value={form.intervention_level}
            onChange={(v) => set('intervention_level', v as InterventionLevel)}
            options={INTERVENTIONS.map((i) => ({ value: i, label: i }))}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <Dropdown
            value={form.status}
            onChange={(v) => set('status', v as ModelConfig['status'])}
            options={[
              { value: 'ready', label: 'ready' },
              { value: 'needs_profile', label: 'needs_profile' },
              { value: 'seeded', label: 'seeded' },
            ]}
          />
        </label>
        <label className="field">
          <span>Temperature</span>
          <input type="number" step="0.1" value={form.params.temperature} onChange={(e) => setParam('temperature', Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Max tokens</span>
          <input type="number" value={form.params.max_tokens} onChange={(e) => setParam('max_tokens', Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Price / 1k input ($)</span>
          <input type="number" step="0.0001" value={form.price_per_1k_input} onChange={(e) => set('price_per_1k_input', Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Price / 1k output ($)</span>
          <input type="number" step="0.0001" value={form.price_per_1k_output} onChange={(e) => set('price_per_1k_output', Number(e.target.value))} />
        </label>
        <label className="field field--check">
          <input type="checkbox" checked={form.runnable} onChange={(e) => set('runnable', e.target.checked)} />
          <span>Runnable (live)</span>
        </label>
      </div>
    </Modal>
  );
}
