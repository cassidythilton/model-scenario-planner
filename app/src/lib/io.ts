/**
 * Import/export helpers for the scenario library (V2).
 * JSON round-trips fully; CSV is export-only (flattened) for spreadsheet review.
 */
import type { Scenario, TaskType, ScorerType } from '../types/harness';

export function downloadFile(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportScenariosJson(scenarios: Scenario[]) {
  downloadFile('scenarios.json', JSON.stringify(scenarios, null, 2));
}

const csvCell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join('|') : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportScenariosCsv(scenarios: Scenario[]) {
  const cols: (keyof Scenario)[] = [
    'id', 'title', 'archetype', 'task_type', 'difficulty', 'scorer_type',
    'source', 'source_ref', 'split', 'tags', 'instruction', 'input_context', 'gold_answer',
  ];
  const head = cols.join(',');
  const rows = scenarios.map((s) => cols.map((c) => csvCell(s[c])).join(','));
  downloadFile('scenarios.csv', [head, ...rows].join('\n'), 'text/csv');
}

const TASK_TYPES: TaskType[] = [
  'classification', 'extraction', 'structured_output', 'rag_qa',
  'summarization', 'reasoning_multistep', 'agentic',
];
const SCORERS: ScorerType[] = ['exact', 'label', 'structured_field', 'reference_similarity'];

/** Parse + lightly validate a JSON array of scenarios. Throws on malformed input. */
export function parseScenariosJson(text: string): Scenario[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('Expected a JSON array of scenarios.');
  return data.map((raw, i): Scenario => {
    if (!raw || typeof raw !== 'object') throw new Error(`Item ${i} is not an object.`);
    const r = raw as Record<string, unknown>;
    if (!r.title || !r.instruction) throw new Error(`Item ${i} is missing title/instruction.`);
    const task_type = (TASK_TYPES.includes(r.task_type as TaskType) ? r.task_type : 'classification') as TaskType;
    const scorer_type = (SCORERS.includes(r.scorer_type as ScorerType) ? r.scorer_type : 'label') as ScorerType;
    return {
      id: String(r.id || `scn_${Date.now().toString(36)}_${i}`),
      title: String(r.title),
      archetype: String(r.archetype || 'Imported'),
      task_type,
      difficulty: ([1, 2, 3].includes(Number(r.difficulty)) ? Number(r.difficulty) : 2) as Scenario['difficulty'],
      instruction: String(r.instruction),
      input_context: String(r.input_context || ''),
      gold_answer: String(r.gold_answer || ''),
      scorer_type,
      source: r.source === 'anonymized_real' ? 'anonymized_real' : 'synthetic',
      source_ref: r.source_ref ? String(r.source_ref) : undefined,
      split: r.split === 'holdout' ? 'holdout' : 'train',
      tags: Array.isArray(r.tags) ? r.tags.map(String) : typeof r.tags === 'string' ? String(r.tags).split('|').filter(Boolean) : [],
    };
  });
}
