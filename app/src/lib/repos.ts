/**
 * AppDB repositories (Shape B, part N1).
 *
 * Typed CRUD over the harness collections. Each domain entity is stored as the
 * AppDB document `content` (including its own logical id, so ids like `cfg_claude`
 * / `scn_summary` stay stable across reloads). `loadX()` returns the content;
 * `saveX()` upserts.
 */
import { createDoc, deleteDoc, listDocs, updateDoc } from './domo';
import type {
  Batch,
  HarnessEval,
  HarnessRun,
  ModelConfig,
  Scenario,
  ScenarioSet,
} from '../types/harness';

const content = <T,>(docs: { id: string; content: T }[]): T[] => docs.map((d) => d.content);

export async function loadScenarios(): Promise<Scenario[]> {
  return content(await listDocs<Scenario>('scenarios'));
}
export async function loadModelConfigs(): Promise<ModelConfig[]> {
  return content(await listDocs<ModelConfig>('modelConfigs'));
}
export async function loadRuns(): Promise<HarnessRun[]> {
  return content(await listDocs<HarnessRun>('runs'));
}
export async function loadEvals(): Promise<HarnessEval[]> {
  return content(await listDocs<HarnessEval>('evals'));
}
export async function loadScenarioSets(): Promise<ScenarioSet[]> {
  return content(await listDocs<ScenarioSet>('scenarioSets'));
}
export async function loadBatches(): Promise<Batch[]> {
  return content(await listDocs<Batch>('batches'));
}

export async function saveRun(run: HarnessRun): Promise<void> {
  await createDoc('runs', run);
}
export async function saveEval(evaluation: HarnessEval): Promise<void> {
  await createDoc('evals', evaluation);
}
export async function saveScenario(scenario: Scenario): Promise<void> {
  await createDoc('scenarios', scenario);
}
export async function saveModelConfig(config: ModelConfig): Promise<void> {
  await createDoc('modelConfigs', config);
}

/** Upsert by logical id (content.id). Uses listDocs (the known-working read path)
 *  to find an existing doc, rather than the AppDB query endpoint — the query path
 *  was failing and silently dropping writes (scenario sets/edits not persisting). */
export async function upsertById<T extends { id: string }>(
  alias: Parameters<typeof listDocs>[0],
  entity: T
): Promise<void> {
  const docs = await listDocs<T>(alias);
  const existing = docs.find((d) => (d.content as { id?: string })?.id === entity.id);
  if (existing) {
    await updateDoc(alias, existing.id, entity);
  } else {
    await createDoc(alias, entity);
  }
}

/** Delete by logical id (content.id). */
export async function deleteById(
  alias: Parameters<typeof listDocs>[0],
  contentId: string
): Promise<void> {
  const docs = await listDocs<{ id?: string }>(alias);
  const matches = docs.filter((d) => d.content?.id === contentId);
  await Promise.all(matches.map((d) => deleteDoc(alias, d.id)));
}
