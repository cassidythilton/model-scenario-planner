/**
 * Symmetric-control guard (R1.4 / part N5).
 *
 * The honest comparison is configured-vs-configured. Any context/few-shot/RAG
 * intervention built for a secondary model must also exist for the frontier
 * anchor, so we never compare a tuned secondary against a vanilla frontier.
 */
import type { InterventionLevel, ModelConfig } from '../types/harness';

export interface SymmetryCheck {
  ok: boolean;
  message?: string;
}

export function checkSymmetric(models: ModelConfig[], candidate: ModelConfig): SymmetryCheck {
  if (candidate.intervention_level === 'zeroshot') return { ok: true };
  if (candidate.tier === 'frontier') return { ok: true };
  const anchorHas = models.some(
    (m) =>
      m.tier === 'frontier' &&
      m.intervention_level === candidate.intervention_level &&
      m.id !== candidate.id
  );
  if (anchorHas) return { ok: true };
  return {
    ok: false,
    message: `Symmetric control: add a frontier-anchor config at "${candidate.intervention_level}" before comparing a secondary at that intervention.`,
  };
}

/** Clone the frontier anchor into a matching-intervention config (for one-click fix). */
export function makeAnchorVariant(
  models: ModelConfig[],
  intervention: InterventionLevel
): ModelConfig | null {
  const anchor = models.find((m) => m.tier === 'frontier');
  if (!anchor) return null;
  const base = anchor.label.split('—')[0].trim();
  return {
    ...anchor,
    id: `${anchor.id}_${intervention}`,
    label: `${base} — ${intervention}`,
    intervention_level: intervention,
  };
}
