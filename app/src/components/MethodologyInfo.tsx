import { useEffect, useRef, useState } from 'react';
import { ACCURACY_BLURB, ACCURACY_CAVEAT, SCORER_INFO, graderLabel } from '../lib/scorers';
import type { HarnessEval, Scenario, ScorerType } from '../types/harness';
import { TASK_LABELS } from '../types/harness';

/** "How is accuracy measured?" — a contextual popover anchored to its trigger
 *  (no modal / overlay). Explains the current scenario's scorer + the glossary. */
export function MethodologyInfo({ scenario, evals }: { scenario: Scenario; evals?: HarnessEval[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const def = SCORER_INFO[scenario.scorer_type];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const scenarioEvals = (evals ?? []).filter((e) => e.scenario_id === scenario.id);
  const usedLexical = scenarioEvals.some((e) => e.scorer_version?.includes('lexical'));
  const versions = Array.from(new Set(scenarioEvals.map((e) => e.scorer_version).filter(Boolean))) as string[];

  return (
    <div className="method-pop-wrap" ref={ref}>
      <button className={`info-btn ${open ? 'is-open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="info-glyph">i</span> How is accuracy measured?
      </button>
      {open && (
        <div className="method-pop" role="dialog" aria-label="How accuracy is measured">
          <div className="method-pop-head">
            <strong>How accuracy is measured</strong>
            <button className="method-pop-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          <p className="method-intro">{ACCURACY_BLURB}</p>

          <div className="method-current">
            <span className="method-eyebrow">This scenario · {TASK_LABELS[scenario.task_type]}</span>
            <h4>{def.label}</h4>
            <p>{def.plain}</p>
            <p className="method-how"><strong>How:</strong> {def.method}</p>
            <p className="method-how"><strong>Score:</strong> {def.range}</p>
            {versions.length > 0 && (
              <p className="method-prov">
                Graded by {versions.map((v) => graderLabel(v)).join(', ')}.
                {usedLexical && ' Embeddings were unavailable, so a lexical-overlap proxy was used — a consistent ranking signal, not a semantic grade.'}
              </p>
            )}
          </div>

          <span className="method-eyebrow">Ranking &amp; &ldquo;best value&rdquo;</span>
          <p className="method-intro">
            The field is ranked by accuracy, but accuracy isn&rsquo;t the whole story. <strong>Best value</strong> flags the
            model with the most accuracy per dollar (accuracy &divide; cost per task) &mdash; the strongest cheaper-model case.
            The <strong>anchor</strong> is the frontier baseline every model is measured against.
          </p>

          <span className="method-eyebrow">All scorers in the harness</span>
          <dl className="method-defs">
            {(Object.keys(SCORER_INFO) as ScorerType[]).map((k) => (
              <div key={k} className={k === scenario.scorer_type ? 'is-current' : ''}>
                <dt>{SCORER_INFO[k].label}{k === scenario.scorer_type && <span className="method-you">this one</span>}</dt>
                <dd>{SCORER_INFO[k].plain} <span className="method-how-sm">{SCORER_INFO[k].method}</span></dd>
              </div>
            ))}
          </dl>

          <p className="method-caveat">{ACCURACY_CAVEAT}</p>
        </div>
      )}
    </div>
  );
}
