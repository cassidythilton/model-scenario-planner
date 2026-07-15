/**
 * RunConfig — the hashable unit of work (Shape B, part B9).
 *
 * A RunConfig fully describes one scenario × model-config execution. It is shown
 * to the user before a run (RunConfig preview), persisted with the resulting Run,
 * and hashed (`config_hash`) so identical runs can be cache-replayed (demo mode)
 * and any result is reproducible/auditable.
 */
import type { ModelConfig, Scenario } from '../types/harness';

export interface RunConfig {
  scenario_id: string;
  model_config_id: string;
  bedrock_model_id: string;
  endpoint: 'runtime' | 'mantle';
  intervention: string;
  params: { temperature: number; max_tokens: number };
  fewshot_examples?: { input: string; output: string }[];
  rag_context?: string | null;
  repeat_index: number;
}

export function buildRunConfig(
  scenario: Scenario,
  model: ModelConfig,
  repeatIndex = 0,
  ragContext: string | null = null
): RunConfig {
  return {
    scenario_id: scenario.id,
    model_config_id: model.id,
    bedrock_model_id: model.bedrock_model_id,
    endpoint: model.endpoint ?? model.path,
    intervention: model.intervention_level,
    params: model.params,
    fewshot_examples: model.fewshot_examples,
    rag_context: ragContext,
    repeat_index: repeatIndex,
  };
}

/** Stable stringify — keys sorted recursively so the hash is order-independent. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit hash → short hex string. Deterministic, dependency-free. */
export function hashRunConfig(config: RunConfig): string {
  const str = canonical(config);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
