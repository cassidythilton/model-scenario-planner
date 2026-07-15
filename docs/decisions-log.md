# Decisions Log

Running record of decisions and open items. Newest at top.

## Confirmed

| # | Decision | Source | Notes |
|---|---|---|---|
| D1 | Domo instance = **`domo.domo.com`** | user (Jun 5, final) | Backend (CE + AppDB) **and** the app live here, where broker `1582c623…` already exists. A custom app calls CE/AppDB same-origin, so app + backend must share an instance. (An earlier modocorp publish was a detour — orphan design there can be deleted.) |
| D2 | AWS region = `us-east-2` (Ohio) | user | ⚠️ Open-weight models (DeepSeek/Qwen/Kimi) often lag in us-east-2 vs us-east-1/us-west-2. Verify availability before Phase 1 registry. |
| D3 | AWS creds via existing **Bedrock Domo Account** (AWS access key + secret, user-created) | user | CE function reads it with `codeengine.getAccount(id)`. Exact `account.properties` key names + account ID/provider-type still to be confirmed (O1). |
| D7 | Claude model access **granted** in us-east-2 | user | Smoke test has a live frontier model to hit. |
| D4 | Standalone full-page React custom app (not App Studio embed) | build plan §0.6 | No Domo Cards; reporting in-app with Recharts. |
| D5 | Reporting is in-React (Recharts), AppDB is the store | build plan §0.6 | Optional Dataset export kept only for backup. |
| D6 | CE language = JavaScript, SigV4 isolated | user pref + research | CE JS has no AWS SDK → must hand-roll SigV4 with `crypto`. Re-evaluate Python+boto3 at deploy (a dedicated "Python packages" capability exists). |

## Deployed artifacts (domo.domo.com)

| Artifact | ID / ref | State |
|---|---|---|
| CE package `bedrock-broker` | `1582c623-99a5-46f5-8641-f7159bc55071` v`1.0.8` | ✅ **Bearer-key auth** (Converse on runtime, chat-completions on mantle). No Domo Account / SigV4 — the account paths are blocked for API-created functions (see below). Key injected at build time (gitignored `key` file → `payload.json`). Validated directly vs Bedrock (Claude + DeepSeek Converse, Titan embeddings, all 200). Mapped in manifest. **Re-point card to 1.0.8.** |
| CE package `scorer` (`scoreRun`) | `8580329d-c552-4613-96ab-3fc70178bc91` v`1.0.4` | ✅ Bearer-key embeddings (Titan). exact / label / structured-field F1 / reference-similarity. Mapped in manifest. **Re-point card to 1.0.4.** |
| ✅ LIVE END-TO-END | `runScenario` → Claude Sonnet 4.6 | **Working (Jun 5).** Real run via card on v1.0.8: `output_text:"Positive"`, 42 in / 5 out tokens, cost $0.000201, AWS `request_id` returned. Bearer-key architecture confirmed in-app. |
| ✅ PLAYGROUND UI LIVE | App side-by-side comparison | **Working (Jun 5).** Real results render; verdict banner correct. Fix: app `unwrap()` peels the CE `result` envelope. |
| ✅ ALL 8 MODELS RUNNABLE | full lineup via Converse | Qwen + MiniMax ids corrected from the live Bedrock catalog (`qwen.qwen3-235b-a22b-2507-v1:0`, `minimax.minimax-m2.1`) and verified 200 via Converse. Lineup: Claude Sonnet 4.6, Nova Pro (us. profile), Llama 3.3 70B, DeepSeek V3.2, Kimi K2.5, GLM 4.7, Qwen3 235B, MiniMax M2.1. |
| AppDB path fix (root cause) | resolve by collection NAME | Reads 404'd because the app used the manifest **alias** (`scenarios`) in the path; Domo resolves AppDB by the real **name** (`llmharness_scenarios`). Mapped alias→name in `domo.ts`; also normalized `.body`-wrapped responses. This is why nothing persisted (silent demo mode). |
| Synthetic data removed | E4 | Deleted the demo runs/evals generator + fallback; all metrics now come from real Bedrock runs only. Removed the "reference data" pill. |
| Agentic scenarios | +6 (draft) | Added 6 agentic sales scenarios (action plan, CRM sync, architecture POV, objection playbook, meeting prep, displacement). Merge-seeding adds them to existing AppDB without clobbering edits. |
| AppDB persistence fix | upsert via listDocs | Scenario sets (+ scenario/registry edits, + seed) weren't persisting — `upsertById` used the AppDB **query** endpoint which was failing and silently dropping writes. Switched to `listDocs`-based upsert/delete; hardened bootstrap so seeding failure can't flip to demo mode. |
| Batch launch fix | in-app confirm | `window.confirm()` is blocked in the Domo app iframe (silently aborted launch) → replaced with an in-app confirm step. |
| Auth decision | **Bedrock long-term API key (Bearer)** | Chosen after Domo-Account paths failed for API-created CE: Account input alias stripped → unmappable; `getAccount()` can't reach un-wired accounts. Key in CE source only (never browser, never git). Account `Amazon Bedrock Account` id=15170 retained for reference. Rotate the exposed `AKIA…` access key. |
| App design (frontend) | `6fe21b29-bcc9-43ba-b73e-a2500c77b195` on **domo.domo.com** | ✅ Published; id pinned in `app/manifest.json` so rebuilds update it. (Modocorp design `736e2388…` is now an orphan — delete it.) |
| ⚠️ Remaining manual step | `bedrockAccount` input type | For **both** packages, the `bedrockAccount` input is created as **text** (create API limitation) — change to **Account** in the CE editor and bind the Bedrock account provider before live calls. |
| Live smoke test | `runScenario` / `scoreRun` | ✅ 400 resolved. Card re-pointed to **broker v1.0.5 / scorer v1.0.1** (no Account input) → HTTP 200. Account resolved server-side via `codeengine.getAccount(account_ref)`. **ROOT CAUSE (definitive):** Domo account id = **15170**. Tested `getAccount("15170")`, `getAccount(15170)`, `getAccount("Amazon Bedrock Account")`, provider type — **all fail in app-invocation context**. Two dead ends for API-created functions: (a) Account *input* → CE create API strips the input alias → `"unmapped account alias "` (empty), wiring can't bind; (b) no input → `getAccount(arbitrary)` can't access an account that isn't supplied via a wired input. **Path forward:** use a **Bedrock API key (Bearer)** stored in the CE function — bypasses Domo Account + SigV4 + wiring entirely. (Alt: author the function in the CE editor so the account input gets a real alias.) |
| Frontend asset | `index-DaxrM6P5.js` | UI fixes (tier-dot hardening, custom select chevron, name overflow) republished to design `6fe21b29…`. Prior cached bundle was `index-DAkyILOH.js` — hard-refresh the app to load the new hash. |

## Publish / deploy state

| Item | State |
|---|---|
| App home | ✅ **`domo.domo.com`** (D1 final). Design `6fe21b29…`, id pinned in `app/manifest.json`. |
| Backend | ✅ All on domo.domo.com: broker v1.0.4 + scorer v1.0.0, both mapped in manifest. AppDB collections auto-provision on first app run (the bootstrap seeds scenarios + registry). |
| Remaining to go fully live | (1) Set `bedrockAccount` input → **Account** type on both CE packages + bind provider. (2) Re-smoke-test. (3) Confirm `account.properties` cred key names (O1). |
| Orphan | modocorp design `736e2388…` — delete from that instance's Asset Library. |

## Key platform findings

- **`create-package` echoes `functions: []` in its immediate response** but the contract is actually stored — verify with `get-package`, not the create response.
- **The create API coerces an `account`-typed input to `text`.** The real **Account** type (bound to a credential data provider) must be set in the CE editor UI. So `bedrockAccount` currently shows as `text` and needs a one-time UI change to Account + provider selection.
- **CE's editor parser registers BOTH top-level `function` declarations AND arrow-consts** as callable functions (arrow-const trick in v1.0.1 was not enough — they still showed with red marks). The only reliable fix: **nest all helpers inside the public function**. Done in v1.0.2.
- **Bedrock SigV4 canonical URI double-encodes `%` in encoded model IDs.** The live smoke test returned Bedrock's expected canonical request with `%253A` for a model id containing `:0`; fixed in v1.0.3 by signing `path.replace(/%/g, '%25')` while keeping the request URL unchanged.
- **Claude 4.x / current Anthropic models require inference profiles for this account/region.** Direct model IDs such as `anthropic.claude-haiku-4-5-20251001-v1:0` and `anthropic.claude-sonnet-4-6` return "on-demand throughput isn't supported"; use the inference profile ID/ARN from Bedrock instead.
- **`update-version` body ≠ `create-package` body.** Update expects a flat `PackageVersion` (`version`, `functions`, `configuration`, `description`, `example`), not `{name, code, language, environment, manifest}`. Avoid resending the create payload to update.
- **CLI mutations prompt `[y/N]`** — pipe `printf 'y\n' |` for non-interactive runs. (This is what silently hung the first two create attempts.)
- **Sandbox writes are workspace-only** — redirect command output into the repo, not `/tmp`.

- **CE account access:** function declares an `Account`-typed input bound to one data provider; at runtime `const account = await codeengine.getAccount(input.id); account.properties` holds the creds. Keys vary by provider type.
- **CE available JS libraries:** `codeengine`, `axios`, `googleAuthLibrary` only. No AWS SDK → SigV4 by hand for Bedrock.
- **CE external calls:** via `axios` / `codeengine.axios`. Internal Domo calls via `codeengine.sendRequest` (auto-authenticated).
- **Release safety:** never "release" a CE package unless the user explicitly says "release".

## Open items

| # | Item | Blocking? |
|---|---|---|
| O1 | Bedrock Domo Account provider-type + ID, and `account.properties` schema (access key / secret / region / session token?) | Blocks CE deploy + smoke test |
| O2 | Verify `boto3` installable in CE Python (would simplify the adapter) | Influences O1 implementation |

## Resolved (this session)

| # | Item | Resolution |
|---|---|---|
| O3 | Frontier anchor model | ✅ **Claude Sonnet 4.6** (latest, via its inference profile) as the **single** frontier anchor. Opus stretch-bar declined. |
| O4 | Bedrock open-weight model availability in us-east-2 | ✅ **Confirmed in catalog:** DeepSeek V3.2, Qwen3, Kimi K2.5, GLM 4.7, MiniMax M2.1 all available. Clears the D2 ⚠️ (open-weight no longer assumed to lag in us-east-2). |
| O5 | Monthly Bedrock cost ceiling | ✅ **$300/mo hard cap**, enforced server-side; pre-flight estimate + dry-run + staged scout→confirm keep real spend well under (est. ~$100–180/mo active). |
| O6 | Anonymization ownership (automated vs manual first pass) | ✅ **S2-B — vetted manual first pass** for the first Gong batch (author redacts offline with the token scheme; only anonymized excerpt pasted into authoring UI). Automated CE scrubber (S2-A) deferred to scale-up. |
| S1 | Open-weight / mantle adapter design | ✅ One OpenAI Chat-Completions schema + one SigV4 signer over `bedrock-runtime`/`bedrock-mantle`. See `docs/shaping/spike-mantle-adapter.md`. |
| S2 | Anonymization mechanism | ✅ Comprehend `DetectPiiEntities` + org/person NER → token map → human-confirm pre-write gate. See `docs/shaping/spike-anonymization.md`. |
