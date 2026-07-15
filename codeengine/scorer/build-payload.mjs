/**
 * Generates payload.json for `community-domo-cli code-engine create-package`.
 * Embeds index.js as the package `code` and declares the scoreRun contract.
 *
 *   node build-payload.mjs
 *
 * To push a NEW VERSION on an existing package, set CE_PACKAGE_ID (+ optional
 * CE_VERSION) — POST with `id` + `version` creates a new version.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(join(here, 'index.js'), 'utf8');

// Inject the Bedrock API key (Bearer) at deploy time (gitignored `key` file).
const apiKey = readFileSync(join(here, '..', '..', 'key'), 'utf8').trim();
if (!apiKey) throw new Error('Empty Bedrock API key');
code = code.split('__BEDROCK_API_KEY__').join(apiKey);

const field = (name, type, nullable = false) => ({
  name,
  displayName: name,
  type,
  dataType: type,
  value: null,
  nullable,
  isList: false,
  children: [],
  entitySubType: null,
  alias: name,
});

const packageId = process.env.CE_PACKAGE_ID;
const version = process.env.CE_VERSION || '1.0.0';

const payload = {
  ...(packageId ? { id: packageId, version } : {}),
  name: 'scorer',
  description: 'LLM Market-Fit Harness — eval engine. Scores a run against a scenario gold answer (exact / label / structured-field F1 / reference-similarity via Titan embeddings).',
  code,
  environment: 'LAMBDA',
  language: 'JAVASCRIPT',
  manifest: {
    functions: [
      {
        name: 'scoreRun',
        displayName: 'Score Run',
        description: 'Scores one run vs a scenario gold answer; dispatches on scorer_type. Embeddings path uses the mapped Bedrock account.',
        inputs: [
          field('scenario', 'object'),
          field('run', 'object'),
          // No Account input — resolved server-side via
          // codeengine.getAccount(scenario.account_ref || 'amazon-bedrock').
        ],
        parameters: [],
        output: field('result', 'object'),
      },
    ],
    configuration: {
      accountsMapping: [],
    },
  },
};

writeFileSync(join(here, 'payload.json'), JSON.stringify(payload, null, 2));
console.log('Wrote payload.json (%d bytes of code embedded)%s', code.length,
  packageId ? ` for package ${packageId} v${version}` : '');
