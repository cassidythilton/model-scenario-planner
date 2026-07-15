/**
 * Generates payload.json for `community-domo-cli code-engine create-package`.
 * Embeds index.js as the package `code` and declares the runScenario contract.
 *
 *   node build-payload.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(join(here, 'index.js'), 'utf8');

// Inject the Bedrock API key (Bearer) at deploy time. The key lives in the
// gitignored repo-root `key` file and is embedded only into payload.json (also
// gitignored) — never into committed source.
const keyPath = join(here, '..', '..', 'key');
const apiKey = readFileSync(keyPath, 'utf8').trim();
if (!apiKey) throw new Error('Empty Bedrock API key at ' + keyPath);
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

// To push a NEW VERSION on an existing package, set CE_PACKAGE_ID (+ optional
// CE_VERSION). Per the create-package skill, POST with `id` + `version` creates
// a new version with the full code/manifest payload.
const packageId = process.env.CE_PACKAGE_ID;
const version = process.env.CE_VERSION || '1.0.0';

const payload = {
  ...(packageId ? { id: packageId, version } : {}),
  name: 'bedrock-broker',
  description: 'LLM Market-Fit Harness — brokers Amazon Bedrock (Converse on runtime, chat-completions on mantle) using a Bedrock API key (Bearer).',
  code,
  environment: 'LAMBDA',
  language: 'JAVASCRIPT',
  manifest: {
    functions: [
      {
        name: 'runScenario',
        displayName: 'Run Scenario',
        description: 'Runs one scenario against one model config via Bedrock Chat-Completions (runtime|mantle). Supports dryRun + throttle handling.',
        inputs: [
          field('scenario', 'object'),
          field('modelConfig', 'object'),
          field('repeatIndex', 'decimal', true),
          field('dryRun', 'boolean', true),
          // No Account input — the account is resolved server-side via
          // codeengine.getAccount(modelConfig.account_ref || 'amazon-bedrock').
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
