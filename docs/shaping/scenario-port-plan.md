---
shaping: true
---

# Real-Scenario Port Plan — DealInspect (Gong) → Harness

Spec for replacing the harness's synthetic scenario library with **real, anonymized, Gong-derived scenarios** lifted from the user's `deal-inspect` project. Builds on the V2 authoring layer and the [S2 anonymization spike](./spike-anonymization.md). Ground truth for the port; no build until the user says "go".

## Source & decisions

- **Source:** `/Users/cassidy.hilton/Cursor Projects/deal-inspect` — real Gong transcript → LLM task pipelines (TDR field seeding, STC call grading, digest, etc.) with explicit JSON schemas and real gold rows.
- **Decisions (Jun 6):**
  - Plan first, then build on "go".
  - **Replace** the synthetic library, but **keep 1–2 simple smoke tests**.
  - Anonymization = **S2-B**: agent tokenizes the real transcripts/gold, user verifies before anything goes live.

## A. Library transition

| Keep (smoke tests) | Why |
|---|---|
| `scn_sentiment` (classification · label) | Trivial, deterministic, ~5 tokens — fastest way to verify the live path after any deploy. |
| `scn_competitors` (extraction · structured_field) | Simple list extraction — exercises JSON/field scoring cheaply. |

**Remove:** the other 7 original synthetic scenarios **and** the 6 synthetic agentic drafts (`scn_actionplan`, `scn_crmsync`, `scn_techpov`, `scn_objplaybook`, `scn_meetingprep`, `scn_displacement`). They're superseded by the real ports below.

**Prune mechanism (important):** merge-seed only *adds*. To remove deprecated scenarios from AppDB without deleting user-authored ones, the seed carries an explicit **`DEPRECATED_SCENARIO_IDS`** list; bootstrap deletes exactly those ids from AppDB once. User-authored scenarios are untouched.

**Result library:** 2 smoke + 9 real ≈ 11 scenarios, all (except smoke) grounded in real anonymized Domo sales calls.

## B. Scenarios to port

One anonymized transcript feeds **multiple** scenarios (efficient + realistic). Plan: agent anonymizes **3 representative opportunities** (spanning deal types) → generate the 9 scenarios below across them.

| # | id | Title | task_type | scorer | Instruction (condensed) | Gold source (DealInspect) |
|---|----|-------|-----------|--------|--------------------------|---------------------------|
| 1 | `tdr_seed` | TDR 23-field seed | structured_output | structured_field | Extract all 23 TDR fields from the call as strict JSON; null if not stated. | `Gong Call Transcripts by Opportunity ID.csv` row (23 cols) |
| 2 | `tdr_ai_level` | AI-opportunity level | classification | label | Classify `ai_level` (Rules/Predictive/Generative/Autonomous/None). | CSV `ai_level` |
| 3 | `tdr_verdict` | Deal verdict | classification | label | Assign the TDR `verdict` enum from the call. | CSV `verdict` |
| 4 | `tdr_risks` | Top risks | reasoning_multistep | reference_similarity | Write the top deal risks + key assumption. | CSV `top_risks`, `key_assumption` |
| 5 | `tdr_partner` | Partner posture | classification | label | Classify partner posture (Amplifying/Neutral/Conflicting/None). | CSV `partner_name`, `partner_posture` |
| 6 | `gong_competitors` | Competitor extraction | extraction | structured_field | List named competitors/incumbents (JSON array). | `namedCompetitors` / `current_state` |
| 7 | `gong_objections` | Objection & pricing concerns | rag_qa | reference_similarity | What objections and pricing concerns were raised? | digest §6 / `top_risks` |
| 8 | `gong_digest` | Deal-intelligence digest | summarization | reference_similarity (+review) | Produce the 10-section deal digest. | curated digest |
| 9 | `stc_grade` | AE STC call grade | classification | structured_field (+review) | Grade the rep on 8 STC dimensions (1–5). | `Grading.ipynb` rubric/output |

Prompts are condensed from DealInspect originals (`tdrSeed.ipynb`, `Grading.ipynb`, `consolidated-sprint4-5.js`).

## C. Anonymization spec (S2-B)

**Token scheme (consistent within a scenario):**
`[CUSTOMER]` (account), `[REP]` / `[AE]` (Domo seller), `[SE]`, `[CHAMPION]`, `[STAKEHOLDER_n]` (+ role, e.g. `[VP_FINANCE]`), `[COMPETITOR_n]`, `[PARTNER]`, `[$AMOUNT]`, `[PRODUCT_X]` (unusual configs), dates kept relative where possible.

**Process (human-confirm gate):**
1. Agent reads `samples/transcriptAgg.json` (excerpts) + matching CSV gold rows — locally, never committed.
2. Agent produces tokenized `input_context` + tokenized `gold_answer` for each scenario → a review file for the user.
3. **User verifies** the redaction diff.
4. Only the **anonymized** text is written to the seed/AppDB. Raw transcripts never enter the harness or git. `source = anonymized_real`, `source_ref = gong_anon_001…003` (no real account/opp id).

**Partner-positioning note:** DealInspect prompts hard-code "Snowflake = partner, Tableau = competitor." For the harness we **tokenize** these (`[PARTNER]`, `[COMPETITOR_n]`) so the scenario tests extraction/reasoning, not Domo's positioning policy.

## D. Scorer fit & gold provenance (be honest)

- **Authoritative gold:** the CSV TDR-seed fields (curated/seeded) → strong gold for #1–#5.
- **Model-generated reference (not human ground truth):** digest (#8), objections (#7), STC grade (`stc_grade`) come from DealInspect's own model outputs. Mark these `reference_similarity` + **`needs_human_review`** and label gold provenance as "reference, not adjudicated." This keeps the methodology honest (don't treat a model's output as truth).
- **STC numeric ratings (`stc_grade`, now included):** `structured_field` exact-match on 8 keys is brittle for subjective 1–5 scores → treat as **reference + `needs_human_review`** (score within ±1 tolerance, not strict equality) rather than adjudicated gold.

## E. Volume & axes

- Start with **3 anonymized opportunities** spanning deal types (e.g., a competitive displacement, a greenfield, a renewal/expansion) so the map shows variety.
- One transcript → scenarios #1–#9 (shared `input_context`), so 3 opps × ~9 tasks ≈ up to 27 scenarios if we want depth; **MVP = 9 scenarios on 1–2 opps**, expand later.
- Assume **English**; if any non-English calls exist, tag `multilingual` (a real axis where DeepSeek/Qwen may shine).

## F. Build steps (on "go")

1. Read `samples/transcriptAgg.json` + `Gong Call Transcripts by Opportunity ID.csv` (local, read-only).
2. Agent-anonymize → emit `docs/shaping/anon-review.md` (tokenized input + gold per scenario) for user verification.
3. On verification: write the new scenarios into the seed (`demoHarness.ts`/`seed.ts`), keep the 2 smoke tests, add `DEPRECATED_SCENARIO_IDS` for the removed synthetic ones.
4. Bootstrap: merge-seed adds new + one-time prune of deprecated ids.
5. Rebuild + republish; verify console counts; run a smoke + one real scenario; then a scout batch.

## G. Open questions — RESOLVED (Jun 6)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Which 1–3 opportunities to anonymize first? | **Agent picks** — choose 3 representative opps spanning deal types (competitive displacement / greenfield / renewal-expansion). |
| Q2 | Accept model-generated reference gold for digest/objections/STC, or curate human gold? | **Accept model-generated reference**, marked `reference_similarity` + `needs_human_review`, gold provenance labeled "reference, not adjudicated." |
| Q3 | Include `stc_grade` now or defer? | **Include now** — promoted from optional to scenario #9 (treated as reference + review per §D). |
| Q4 | Any non-English calls for a multilingual axis? | **No** — none known. Assume English; revisit if multilingual calls surface later. |

## Not porting (out of scope)

CRM-only tasks (TDR candidate ranking — needs the SFDC export, not transcripts), Perplexity/Sumble web-research tasks (external data), and the recipe generator (orchestration spec, not a single evaluable response).
