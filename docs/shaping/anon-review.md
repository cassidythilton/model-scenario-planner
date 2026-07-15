---
shaping: true
status: AWAITING USER VERIFICATION
---

# Anonymization & Gold Review — DealInspect → Harness (S2-B gate)

**This is the human-confirm gate.** Nothing here is written to the seed or AppDB until you sign off (bottom of file). Raw transcripts stay local and are never committed.

---

## 0. Important finding before you review (read this first)

The plan assumed each transcript could be paired with its curated CSV gold row. **That assumption does not hold in the source data.** The three DealInspect files are non-overlapping sets:

| File | What it is | Opportunities |
|---|---|---|
| `transcriptAgg.json` | **Real call transcripts** (10) | Ndn Collective, Coppersmith, AWH, CY-Fair CU, Forum One, Navigatormd, DTH, Tron Solar, Netsmartz, St John's Univ. |
| `Gong Call Transcripts by Opportunity ID.csv` | Curated TDR **field gold** (9) — *no transcript text* | Sony, UPS, Archaea, Dynasplint, Talen, Nephrology, CODEPATH, ELEU, GCR |
| `gold_revops_opportunities_master.json` | SFDC CRM export (500 rows) — no transcripts, no TDR fields | (CRM metadata only) |

**There is zero opportunity-ID overlap between the transcripts and the CSV gold.** So we cannot use a transcript as input and its matching CSV row as authoritative gold.

**Consequence for gold provenance (honest framing):**
- I selected 3 deals **from the transcripts we actually have** (`transcriptAgg.json`).
- Gold below is **agent-adjudicated by reading the real transcript** (then verified by you), *not* lifted from a matched curated CSV row. This is legitimate human-in-the-loop gold for classification/extraction (I read the call and assigned the label), and **reference-only** for the generative tasks (digest/STC). The CSV remains useful only as the **enum vocabulary** (verdict / ai_level / partner_posture pick-lists) and as few-shot exemplars.
- This is arguably *stronger* than the original plan for the classification/extraction tasks (gold is read from the same call the model sees), and appropriately humble for the generative ones.

**Security note:** `samples/Grading.ipynb` contains a hard-coded Domo dev token. I did not copy it anywhere — recommend you rotate it.

---

## 1. Anonymization policy (please confirm — one open choice)

**Tokenized (removed):** people names → role tokens; account/company name → `[CUSTOMER]`; reference customers → `[REFERENCE_CUSTOMER]`; dollar amounts → `[$AMOUNT]`; any personal identifiers.

**Recommendation — KEEP public software/vendor product names** (Power BI, Tableau, Looker, Snowflake, Jack Henry/Symitar, Ellucian Banner, Argos, NetSuite, Salesforce, Anthropic/Claude, MCP, Workbench). These are **not PII**, and keeping them makes the competitor-extraction and partner-posture scenarios actually scorable (e.g., "classify Snowflake's posture" is meaningless if Snowflake is tokenized to `[PARTNER]`).

> ⚠️ This **differs from plan §C**, which said tokenize `[COMPETITOR_n]`/`[PARTNER]`. **Decision needed:** keep public product names (my rec, better scenarios) or fully tokenize them (stricter, weaker tests)? **Default if you say nothing: keep product names.**

---

## 2. The 3 selected deals (deal-type spread) + adjudicated labels

| Handle | Deal type | Industry | verdict | ai_level | partner / posture |
|---|---|---|---|---|---|
| `gong_anon_001` | New-logo / greenfield | Credit union (fin-serv) | Proceed with Corrections | No AI Opportunity | services partner / **None** |
| `gong_anon_002` | Competitive re-eval / displacement | Higher education | **Rework Before Advancing** | No AI Opportunity | **Snowflake / Amplifying** |
| `gong_anon_003` | Existing-customer expansion | Healthcare analytics ISV | **Proceed** | **Generative AI** | None |

**Label spread:** verdict = 3 distinct ✓ · ai_level = 2 distinct (incl. Generative) · partner_posture = 2 distinct (Amplifying + None). Honestly adjudicated, not forced. If you want even more spread (e.g., a "Conflicting" partner or a "Predictive AI"), I can swap in DTH Expeditors or Forum One — say the word.

---

## 3. `gong_anon_001` — Credit union (greenfield new-logo)

**Token legend:** `[CUSTOMER]` = the credit union · `[AE]` = Domo AE · `[PARTNER_REP]`/`[PARTNER_LEAD]`/`[PARTNER_SE]` = implementation-services partner staff · `[CHAMPION]` = customer IT lead · `[STAKEHOLDER_FINANCE]` = customer process/finance owner · `[REFERENCE_CUSTOMER]` = peer reference org · `[$AMOUNT]` = redacted price.

### Anonymized input_context (condensed excerpt — verify redaction)
> [AE]: Before implementation, let me walk the platform cost. Based on the use case we discussed we're evaluating about [$AMOUNT] — that's consumption-based: no limits on users, connectors, or roles, ~half a billion rows at high-frequency refresh (as often as every 15 min). Domo Everywhere, data-science tiles, Jupyter, write-back, sandbox, and silver support are all included. A comparable user-based setup years ago at [REFERENCE_CUSTOMER] ran far higher once you add those à la carte.
> [CHAMPION]: How much is one credit if we use more data?
> [AE]: ~$1.50/credit, scaling down to ~$0.10 at higher volumes.
> [STAKEHOLDER_FINANCE]: Anything that does what we need will be expensive — it didn't throw me off my chair.
> [AE]: Vs. piecing together Power BI's suite you're often at a much higher start. ... [PARTNER_REP]: Implementation is ~260 hours; two options — consultant-executed at [$AMOUNT] or code-delivery at [$AMOUNT]. We connect Symitar (Jack Henry) via its REST API; our team has done several Jack Henry credit-union builds.
> [STAKEHOLDER_FINANCE]: Helpful if we don't have to pay until 2024 — gives me leverage to get it approved. Our budget season starts in October and it goes through the board.
> [AE]: We can structure net-60 so you're using the platform before first payment. Next steps?
> [STAKEHOLDER_FINANCE]: We'll talk to the CEO and CFO about fitting it in the 2024 budget, then it goes to the board. Can you send an ROI analysis we can show them?

### Gold per scenario
- **tdr_seed (23-field JSON):**
```json
{
  "strategic_value": "Medium",
  "customer_decision": "Whether to adopt Domo as the BI/analytics platform to build teller, lending, marketing, member, and operations dashboards, replacing manual reporting.",
  "why_now": "Pricing under review now; targeting a 2024 rollout with budget season starting in October and board approval required.",
  "key_technical_stakeholders": "[CHAMPION] (IT lead), [STAKEHOLDER_FINANCE] (process/finance); CEO and CFO referenced as approvers.",
  "timeline": "This Quarter",
  "cloud_platform": "On-prem core (Symitar)",
  "current_state": "Core banking on Jack Henry/Symitar; reporting is manual; no Domo today. Reviewed consumption pricing and a reference call with [REFERENCE_CUSTOMER].",
  "target_state": "Domo consumption platform with ~5 dashboards (executive, lending, agent performance, members, marketing), Symitar connected via API, role-based access, partner-led ~260-hour implementation.",
  "domo_layers": ["Data Integration", "Visualization / BI", "Automation / Alerts"],
  "out_of_scope": "Core banking system replacement.",
  "why_domo": "All-in-one connectors+ETL+viz, consumption pricing with unlimited users, proven at peer credit unions/[REFERENCE_CUSTOMER]; lower TCO than assembling Power BI's suite.",
  "top_risks": "Budget approval and board/CFO sign-off; pricing not yet approved; payment timing (net-60 / 2024 budget); reliable data access from Symitar.",
  "key_assumption": "Symitar data is accessible via REST API and the partner can connect it reliably.",
  "verdict": "Proceed with Corrections",
  "partner_name": "Implementation-services partner",
  "partner_posture": "None",
  "ai_level": "No AI Opportunity Identified",
  "ai_signals": null,
  "ai_problem": null,
  "ai_data": null,
  "ai_value": null,
  "expected_users": "Unlimited (consumption) — teller/lending/marketing/ops staff plus executives/board.",
  "adoption_success": "Board/CFO approve budget; ~5 dashboards live; ROI story for CEO/board; staff self-serve reporting."
}
```
- **tdr_ai_level:** `No AI Opportunity Identified`
- **tdr_verdict:** `Proceed with Corrections`
- **tdr_risks:** Top risks — budget/board approval and pricing/payment timing. Key assumption — Symitar data is API-accessible and reliably connectable.
- **tdr_partner:** name = implementation-services partner; **posture = None** (no cloud/ecosystem partner).
- **gong_competitors:** `["Power BI"]`
- **gong_objections:** Price/budget ([$AMOUNT] platform + [$AMOUNT] implementation) and the approval path (CEO/CFO → board, October budget season; net-60/defer first payment to 2024); needs an ROI analysis to sell internally. *(reference + review)*
- **gong_digest:** *(reference + review)* — 10-section deal digest: late-stage greenfield credit-union deal; champion is IT, economic buyer CEO/CFO + board; consumption pricing presented; partner-led Symitar build; main blocker is budget/board timing; recommended next step ROI deck + MSA.
- **stc_grade:** *(reference + review; note: late-stage pricing call, light on discovery)* — preparation 4, current_situation 3, problem_definition 2, impact 2, ideal_solution 3, benefit 4, layering 3, demo_preparation 3.

---

## 4. `gong_anon_002` — Higher education (competitive re-eval / displacement)

**Token legend:** `[CUSTOMER]` = the university · `[AE]` = Domo AE · `[CHAMPION]` = customer faculty/data-architecture lead · `[SE]` = Domo sales engineer (future call). Public products kept: Power BI, Tableau, Looker, Snowflake, Ellucian Banner, Argos, AWS DMS, App Studio.

### Anonymized input_context (condensed excerpt — verify redaction)
> [AE]: I listened to the first call twice. You're evaluating Domo from two angles — teaching it in your courses, and re-evaluating internally because you standardized on Power BI ~2–3 years ago and you're now migrating ERP from AWS-managed to Ellucian Banner SaaS.
> [CHAMPION]: It's a combination. Pre-migration, users were on Excel/Brio; Banner recommended Argos but the learning curve is steep. Power BI is growing legs but people keep asking "where do I go, how do I set this up?" We have a Snowflake warehouse — AWS DMS lands non-ERP data into Snowflake, and we want users connecting to a single governed source. We might just stay with Power BI, but if there's a smoother tool we'd be silly not to evaluate it.
> [AE]: Domo can sit on Snowflake as the BI layer, or be the full stack. We have a strong Snowflake partnership. ... [demo of cards/pages, drag-and-drop ETL, App Studio] ...
> [CHAMPION]: It inherits Tableau-like left-hand fields and improves on Power BI's modeling. Do you do hinting on chart types? How do you handle aliasing — modeling layer or viz layer?
> [AE]: I'll bring my sales engineer for the technical depth. Let's schedule a follow-up demo + pricing.
> [CHAMPION]: I'd want to understand higher-ed pricing — is it per-FTE or knowledge worker? And whether AI/apps are up-charges.
> [AE]: Good news — consumption pricing, unlimited users, all assets included; credits are consumed on data movement, not on dashboard engagement.

### Gold per scenario
- **tdr_seed (23-field JSON):**
```json
{
  "strategic_value": "Medium",
  "customer_decision": "Whether to adopt Domo to complement/replace Power BI for university-wide self-service BI (and as a teaching tool) during an ERP migration to Ellucian Banner SaaS.",
  "why_now": "ERP relaunch (AWS-managed to Ellucian Banner SaaS) is a natural pivot point to re-evaluate BI; Power BI adoption is stalling on learning curve and inconsistent use.",
  "key_technical_stakeholders": "[CHAMPION] (faculty; oversees data warehousing); AVP of digital strategy (standardized on Power BI); central data office / data scientists.",
  "timeline": "This Quarter",
  "cloud_platform": "AWS; Snowflake warehouse (AWS DMS ingestion)",
  "current_state": "Snowflake warehouse; Power BI standardized 2-3 years ago with inconsistent adoption; Excel/Brio/Argos for operational reporting; ELT done in Snowflake; ERP migrating to Ellucian Banner SaaS.",
  "target_state": "Domo as the self-service BI layer on Snowflake (possibly multi-cloud via Cloud Amplifier), closing the analyst-to-business-user gap, with governance; possibly App Studio apps; also used in teaching.",
  "domo_layers": ["Visualization / BI", "Data Integration", "App Development", "Embedded Analytics"],
  "out_of_scope": "Replacing Snowflake (Domo sits on top); ELT remains in Snowflake.",
  "why_domo": "Business-user self-service without SQL; sits on Snowflake; multi-cloud; consumption pricing with unlimited users; App Studio.",
  "top_risks": "Incumbent Power BI inertia ('might just stay with Power BI'); no compelling event or budget yet; Ellucian wanting its own warehouse; higher-ed pricing expectations.",
  "key_assumption": "Domo can sit on Snowflake (and Ellucian Banner) and deliver smoother self-service than Power BI, enough to justify a switch.",
  "verdict": "Rework Before Advancing",
  "partner_name": "Snowflake",
  "partner_posture": "Amplifying",
  "ai_level": "No AI Opportunity Identified",
  "ai_signals": "Data scientists using Python; research apps — not a defined AI opportunity for this deal.",
  "ai_problem": null,
  "ai_data": null,
  "ai_value": null,
  "expected_users": "Unlimited (consumption) — academic and admin departments (bursar, registration, financial aid, deans, provost, HR), data scientists, and students (teaching).",
  "adoption_success": "Consistent university-wide self-service adoption; governance/lineage; less Excel-dump reporting; switching from Power BI where it fits."
}
```
- **tdr_ai_level:** `No AI Opportunity Identified`
- **tdr_verdict:** `Rework Before Advancing` *(early discovery, no compelling event/budget, incumbent inertia — flagged for your confirmation; "Proceed with Corrections" is defensible if you prefer)*
- **tdr_risks:** Top risks — incumbent Power BI inertia and no compelling event/budget. Key assumption — Domo-on-Snowflake delivers smoother self-service than the incumbent.
- **tdr_partner:** name = **Snowflake**; **posture = Amplifying**.
- **gong_competitors:** `["Power BI", "Tableau", "Looker"]`
- **gong_objections:** Change resistance / incumbent inertia; learning curve; pricing & licensing model questions (higher-ed pricing, per-FTE vs knowledge worker, AI/app up-charges); Ellucian wanting its own warehouse. *(reference + review)*
- **gong_digest:** *(reference + review)* — competitive re-eval triggered by ERP migration; Power BI incumbent; Snowflake-amplified; champion engaged but no economic buyer/budget yet; next step technical demo + pricing; risk = "do nothing / stay on Power BI."
- **stc_grade:** *(reference + review; strong discovery+demo call)* — preparation 4, current_situation 5, problem_definition 4, impact 3, ideal_solution 4, benefit 3, layering 4, demo_preparation 3.

---

## 5. `gong_anon_003` — Healthcare analytics ISV (existing-customer expansion + GenAI)

**Token legend:** `[CUSTOMER]` = the ISV · `[AE]` = Domo AE · `[SE]` = Domo solutions consultant · `[CHAMPION]` = customer technical lead · `[STAKEHOLDER_EXEC]` = customer product/business owner · `[BI_DEV]` = new BI developer. Public products kept: Domo Everywhere, AI readiness, AI chat, MCP, Anthropic/Claude, Workbench, ADF, SQL Server, Power BI, Tableau.

### Anonymized input_context (condensed excerpt — verify redaction)
> [CHAMPION]: Our pipeline is very complex — multi-tenant, separate databases per plan because of BAA agreements; stored procs build datasets that Domo pulls via Workbench. Any benefit to pushing via the Domo API instead?
> [SE]: Not really — Workbench is battle-tested; if it's working, don't change it.
> [CHAMPION]: Do customers embed Domo views inside their own HTML to build a custom journey?
> [SE]: Many use Domo Everywhere (iframe embed). [STAKEHOLDER_EXEC]: That portal is our core product — we license it to insurance brokers, powered mostly by Domo. Clients can modify our curated content but can't push their own data; ~90% just view/download, ~10% build.
> [AE]: On AI — the agenda item is AI readiness. [SE]: Garbage in, garbage out. First make sure datasets answer BI questions, then layer AI chat, then add AI-readiness context (synonyms, column meaning). Domo's AI is powered by Anthropic Claude and your data stays in Domo.
> [CHAMPION]: I'm building markdown files documenting every dataset/field — if your LLM's expected markdown lined up with mine it'd help tremendously. I've also been scoping MCP servers to call external systems and become our AI chatbot.
> [SE]: We have AI-readiness automation in alpha, plus semantic models (closed beta) and Workflows for agentic tasks / external API calls. [AE]: Want me to sign you up for the beta program?
> [CHAMPION]: Sign us up. [SE]: Test AI chat internally before surfacing to customers. [CHAMPION]: Our data is really complex — it won't go well without readiness.

### Gold per scenario
- **tdr_seed (23-field JSON):**
```json
{
  "strategic_value": "High",
  "customer_decision": "How to expand existing Domo usage — improve the embedded analytics (Domo Everywhere) journey for their insurance-broker portal and operationalize AI (AI readiness then AI chat for clients).",
  "why_now": "Standing up a BI team (new BI developer) and AI is top-of-mind; want a better embedded UX and to evaluate AI chat / agentic / MCP.",
  "key_technical_stakeholders": "[CHAMPION] (technical lead), [STAKEHOLDER_EXEC] (product/business owner), [BI_DEV] (new BI developer), plus additional team.",
  "timeline": "Ongoing (existing customer)",
  "cloud_platform": "SQL Server / Azure (ADF pipelines), multi-tenant per BAA",
  "current_state": "Existing Domo consumption customer; complex multi-tenant pipeline (SQL Server stored procs to Domo via Workbench); core broker portal powered by Domo Everywhere (iframe embed); clients edit curated content but cannot push data; ~90/10 view/build split.",
  "target_state": "Improved embedded 'journey' UX via Domo Everywhere/HTML embed; AI readiness on datasets then AI chat for clients; explore semantic models, Workflows, MCP/agentic; integrate markdown data-dictionary with AI readiness.",
  "domo_layers": ["Embedded Analytics", "Visualization / BI", "AI / ML", "Automation / Alerts", "Data Integration"],
  "out_of_scope": "Replacing Workbench (works fine); clients pushing their own data; replacing the core pipeline.",
  "why_domo": "Already embedded in the core product; consumption already includes Domo Everywhere + AI; roadmap (AI-readiness automation, semantic models, MCP/Workflows) aligns with their agentic ambitions.",
  "top_risks": "Data complexity (multi-tenant, HIPAA/BAA) creating AI 'garbage in, garbage out' risk; AI readiness is manual and labor-intensive; focus / shiny-object risk; prior internal skepticism on the chatbot.",
  "key_assumption": "Investing in AI readiness (data dictionary/markdown + context) makes AI chat reliable enough to surface to external clients.",
  "verdict": "Proceed",
  "partner_name": "None",
  "partner_posture": "None",
  "ai_level": "Generative AI",
  "ai_signals": "AI chat for clients; agentic/MCP ambitions; semantic models; manual data-dictionary/markdown effort; embedding AI into the portal journey.",
  "ai_problem": "Inefficient multi-view portal UX; want natural-language/AI-driven reporting for broker clients over complex multi-tenant data.",
  "ai_data": "Structured claims/risk data (multi-tenant SQL Server) plus markdown data dictionaries.",
  "ai_value": "Differentiated client experience (AI chat + journey-based embedded reporting); monetizable reporting-as-a-service.",
  "expected_users": "Insurance brokers (clients) via the embedded portal plus the internal BI team; ~90% viewers / 10% builders.",
  "adoption_success": "Improved embedded journey UX; AI readiness applied; AI chat validated internally then surfaced to clients; possible monetization of enhanced/AI reporting."
}
```
- **tdr_ai_level:** `Generative AI`
- **tdr_verdict:** `Proceed`
- **tdr_risks:** Top risks — data complexity/HIPAA causing GIGO risk for AI; manual AI-readiness burden; focus/shiny-object risk. Key assumption — AI readiness makes client-facing AI chat reliable.
- **tdr_partner:** name = None; posture = None. *(Anthropic/Claude is Domo's embedded LLM, not the customer's partner.)*
- **gong_competitors:** `[]` — none active (existing customer). Power BI/Tableau are referenced only as their clients' user backgrounds, not as competition. *(Confirm: empty array, or list the referenced products?)*
- **gong_objections:** Not pricing (existing consumption customer). Concerns: data complexity/HIPAA risk for AI; manual readiness burden; staying focused vs. shiny objects; prior chatbot skepticism. *(reference + review)*
- **gong_digest:** *(reference + review)* — healthy existing ISV embedding Domo in a broker portal; expansion via better embedded journey + client-facing AI chat; main gating item is AI readiness on complex multi-tenant/HIPAA data; clear next steps (beta signup, Domo Everywhere docs, resume AI-readiness tagging).
- **stc_grade:** *(reference + review; NOTE: this is an account-management/enablement call — the STC sales rubric is a weak fit)* — preparation 4, current_situation 4, problem_definition 3, impact 3, ideal_solution 4, benefit 3, layering 4, demo_preparation 4.

---

## 6. Scenario → scorer → provenance summary

| Scenario id | task_type | scorer | Gold provenance | Flag |
|---|---|---|---|---|
| `tdr_seed` | structured_output | structured_field | agent-adjudicated from transcript | verify |
| `tdr_ai_level` | classification | label | agent-adjudicated | verify |
| `tdr_verdict` | classification | label | agent-adjudicated | verify (002 = Rework?) |
| `tdr_risks` | reasoning_multistep | reference_similarity | agent-adjudicated | needs_human_review |
| `tdr_partner` | classification | label | agent-adjudicated | verify |
| `gong_competitors` | extraction | structured_field | agent-adjudicated | verify (003 empty?) |
| `gong_objections` | rag_qa | reference_similarity | reference | needs_human_review |
| `gong_digest` | summarization | reference_similarity | reference | needs_human_review |
| `stc_grade` | classification | structured_field (±1 tol) | reference | needs_human_review; weak fit on AM call (003) |

Plus the **2 retained smoke tests** (`scn_sentiment`, `scn_competitors`).

---

## 7. Decisions I need from you (the gate)

1. **Anonymization policy** — keep public product names (my rec) or fully tokenize competitors/partners? *(default: keep)*
2. **Redaction** — does each condensed excerpt in §3–§5 read as fully de-identified? Flag anything that still feels identifying.
3. **`gong_anon_002` verdict** — `Rework Before Advancing` (my read) or `Proceed with Corrections`?
4. **`gong_anon_003` competitors** — empty array `[]` (my read) or list the referenced products?
5. **Scope** — proceed with all 3 opps × 9 scenarios (+2 smoke ≈ 29 scenarios), or trim to MVP (e.g., 1–2 opps × 9)?
6. **Swap?** — want more label spread (a "Conflicting" partner / "Predictive AI")? I can swap in DTH Expeditors or Forum One.

**On your sign-off**, I'll: write these into the seed (`demoHarness.ts`/`seed.ts`) with `source = anonymized_real` and `source_ref = gong_anon_001..003`, add `DEPRECATED_SCENARIO_IDS` for the synthetic scenarios being retired, wire the one-time bootstrap prune, then rebuild + republish and run a smoke + one real scenario.

— Awaiting your verification. Nothing is written until you confirm.
