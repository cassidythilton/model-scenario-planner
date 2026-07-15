---
shaping: true
---

# Spike S2 — Gong transcript anonymization

Resolves the flagged unknown on **B3** → unblocks **R2** (real, authorable scenarios). Relates to open item **O6**.

## Context

The most sensitive data path: real Gong sales-call transcripts become scenarios. The hard requirement (scope §7.1, R2.2) is that **raw transcripts never enter the harness** — only anonymized text is stored, with tokens consistent within a scenario so the task still makes sense.

## Goal

Describe the concrete mechanism that (a) detects and replaces PII before storage, (b) guarantees the raw transcript is never persisted, and (c) keeps tokenization consistent — and identify the one real decision (automated vs manual first pass).

## Questions & answers

| # | Question | Finding |
|---|----------|---------|
| **S2-Q1** | Is automated PII detection reachable from CodeEngine? | Yes. **Amazon Comprehend** synchronous `DetectPiiEntities` returns entity type + char offsets + confidence (EMAIL, PHONE, NAME, ADDRESS, SSN, CREDIT_DEBIT_*, bank/IDs, etc.) and supports `REPLACE_WITH_PII_ENTITY_TYPE` masking. Callable via the **same hand-rolled SigV4 pattern** already in the broker (service name `comprehend`) — no new auth, no AWS SDK needed. |
| **S2-Q2** | Does it catch company names? | Not as PII. Comprehend `NAME` is individuals only and explicitly **excludes organizations**. Company/competitor names need a supplemental pass — Comprehend `DetectEntities` (has `ORGANIZATION`/`PERSON` types) or a Bedrock NER prompt — then map to stable tokens (`[COMPANY_A]`, `[COMPETITOR_1]`). |
| **S2-Q3** | How is tokenization kept consistent within a scenario? | Build a per-scenario **entity → token map** from detected spans (same surface form → same token), apply by offset, and carry the map only as long as needed to produce the excerpt. `[CUSTOMER]`/`[REP]`/`[COMPANY_A]` resolve to the same party throughout. |
| **S2-Q4** | How do we guarantee raw text is never stored? | Anonymization is a **pre-write gate**: the create-scenario flow cannot persist until it has an anonymized payload. Raw text is sent transiently to the scrubber (CodeEngine, which does **not** write it to AppDB) and the UI persists **only** the anonymized excerpt. Any kept mapping lives **outside** the harness, access-controlled. A "no raw field exists on the Scenario record" schema constraint enforces it structurally. |
| **S2-Q5** | Multilingual? | Comprehend PII supports en/es (plus more for general entities); non-English Gong calls are a real axis where DeepSeek/Qwen may shine. If present, route those through a Bedrock-NER fallback and tag the scenario `multilingual`. |

## The one real decision (O6): who runs the first pass

| Option | Mechanism | Trade-off |
|--------|-----------|-----------|
| **S2-A — Automated CE scrubber** | `anonymizeTranscript(raw)` CodeEngine fn: Comprehend PII + org/person entities → token map → masked excerpt + a **detected-entities report**; UI shows a redaction diff for **mandatory human confirm** before persist. | Fast, scales to many calls; still human-gated. Recommended for volume. |
| **S2-B — Vetted manual first pass** | Author redacts offline using the token scheme, pastes only the anonymized excerpt into the authoring UI; no raw text ever leaves the author's machine. | Highest assurance, lowest throughput; good for the *first* small batch while trust is established. |

Both mechanisms are understood. ✅ **Decided (O6): S2-B for the first batch** (build trust + label the token scheme), then **S2-A with mandatory human review** for scale. Either way the **pre-write gate + no-raw-field schema** is the non-negotiable control.

## Resolution

**The anonymization mechanism is understood** (Comprehend + supplemental org/person NER + consistent token map + a pre-write human-confirm gate that never persists raw text). This flips **B3 flag → resolved** and **R2 → ✅ for Shape B**. The only open choice is S2-A vs S2-B for the first batch (a sequencing/ownership call, not a mechanism unknown).

### Open follow-ups (decision, not mechanism)
- ✅ **O6 resolved: S2-B** (vetted manual first pass) for the first Gong batch; automated CE scrubber (S2-A) deferred to scale-up.
- Confirm Comprehend is enabled / permitted on the AWS account + region (us-east-2), and whether the existing Bedrock Domo Account's IAM role can call Comprehend or needs an added policy. *(Lower priority now — S2-B doesn't call Comprehend until S2-A is built.)*
- Record the data-isolation posture for the scrubber path (R8.3) before any real transcript flows.
