import type { ScorerType } from '../types/harness';

export interface ScorerDef {
  label: string;
  plain: string;   // one-line, exec-readable
  method: string;  // how the number is produced
  range: string;   // what the score means
}

export const SCORER_INFO: Record<ScorerType, ScorerDef> = {
  exact: {
    label: 'Exact match',
    plain: 'The answer must match the reference exactly.',
    method: 'The output is normalized (case, spacing, punctuation) and compared to the gold answer.',
    range: '1 = identical, 0 = not.',
  },
  label: {
    label: 'Label match',
    plain: 'The answer must land on the correct category.',
    method: 'Checks whether the output states the correct class label (e.g. a sentiment, risk level, or verdict).',
    range: '1 = correct class, 0 = wrong.',
  },
  structured_field: {
    label: 'Field-level F1',
    plain: 'Credit for each correct field or item extracted.',
    method: 'The output is parsed as JSON and compared to the gold field-by-field (or item-by-item for lists). The score is the F1 balance of precision (how much of what it returned was right) and recall (how much of what it should have returned it found).',
    range: '0–1; partial credit for partially-correct extractions.',
  },
  reference_similarity: {
    label: 'Semantic similarity',
    plain: 'How close the answer is in meaning to a reference answer.',
    method: 'Primary: cosine similarity between AI text-embeddings of the output and the reference answer. Fallback (when embeddings are unavailable): term-frequency (lexical) overlap. Best for open-ended work — emails, summaries, action plans — where wording varies but meaning matters.',
    range: '0–1; higher = closer in meaning.',
  },
};

export const ACCURACY_BLURB =
  'Accuracy is the scenario\u2019s scorer result on a 0\u2013100 scale. Every scenario declares its scorer up front (pre-registered), and every model\u2019s output is graded the exact same way against the same reference answer, then compared to a per-task pass bar.';

export const ACCURACY_CAVEAT =
  'Semantic-similarity scores are a consistent ranking signal, not a human grade. Any result below the pass bar is flagged for human review, and reference answers derived from model output are labeled as reference (not adjudicated) truth.';

/** Human label for how a specific eval was graded, from its scorer_version. */
export function graderLabel(scorerVersion?: string): string {
  if (!scorerVersion) return 'unknown';
  if (scorerVersion.includes('lexical')) return 'lexical overlap (embedding fallback)';
  if (scorerVersion.startsWith('local')) return 'local grader';
  if (scorerVersion.startsWith('v')) return `server grader ${scorerVersion} (embeddings)`;
  return scorerVersion;
}
