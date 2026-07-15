/**
 * Seed payload for first-run provisioning (Shape B, part N9).
 *
 * The canonical scenario library + the locked 8-model registry. On first run
 * (empty AppDB), `bootstrap` writes these into the `scenarios` and `modelConfigs`
 * collections. They are the real, editable seed — not synthetic run evidence.
 *
 * The synthetic runs/evals in `demoHarness` remain only as a display fallback
 * until real runs (playground / batches) accumulate.
 */
export { demoScenarios as seedScenarios, demoModelConfigs as seedModelConfigs, FRONTIER_CONFIG_ID } from './demoHarness';
