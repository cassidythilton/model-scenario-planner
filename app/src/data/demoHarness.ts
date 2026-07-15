import type { ModelConfig, Scenario } from '../types/harness';

/* ------------------------------------------------------------------ *
 * Scenarios — Gong-derived sales archetypes spanning easy -> hard.
 * Anonymized tokens ([CUSTOMER], [REP]) per the harness data policy.
 * ------------------------------------------------------------------ */
export const demoScenarios: Scenario[] = [
  {
    id: 'scn_sentiment',
    title: 'Support recovery sentiment',
    archetype: 'Sentiment read',
    task_type: 'classification',
    difficulty: 1,
    instruction: 'Classify sentiment as positive, negative, or neutral. One word.',
    input_context:
      "The onboarding was rough but [REP] fixed everything within a day. I'd recommend it.",
    gold_answer: 'positive',
    scorer_type: 'label',
    source: 'synthetic',
    tags: ['support', 'smoke-test'],
  },
  {
    id: 'scn_objection',
    title: 'Objection identification',
    archetype: 'Objection ID',
    task_type: 'classification',
    difficulty: 2,
    instruction: 'Identify the primary objection: price, timing, authority, or competitor.',
    input_context:
      "[CUSTOMER]: The platform looks great, but we just signed with [COMPANY_B] last quarter and can't justify switching yet.",
    gold_answer: 'competitor',
    scorer_type: 'label',
    source: 'anonymized_real',
    tags: ['discovery', 'objection'],
  },
  {
    id: 'scn_risk',
    title: 'Deal risk / red-flag detection',
    archetype: 'Risk detection',
    task_type: 'classification',
    difficulty: 3,
    instruction: 'Is this deal at risk? Answer at_risk or healthy.',
    input_context:
      "[CUSTOMER] went quiet for three weeks, the economic buyer skipped the last two calls, and procurement asked for a month-to-month option.",
    gold_answer: 'at_risk',
    scorer_type: 'label',
    source: 'anonymized_real',
    tags: ['risk', 'forecasting'],
  },
  {
    id: 'scn_competitors',
    title: 'Competitor mention extraction',
    archetype: 'Competitor extraction',
    task_type: 'extraction',
    difficulty: 1,
    instruction: 'Extract every competitor named, as a JSON array of strings.',
    input_context:
      'We evaluated [COMPANY_B] and [COMPANY_C], and someone mentioned [COMPANY_D] but we never demoed it.',
    gold_answer: '["[COMPANY_B]","[COMPANY_C]","[COMPANY_D]"]',
    scorer_type: 'structured_field',
    source: 'anonymized_real',
    tags: ['competitive'],
  },
  {
    id: 'scn_nextsteps',
    title: 'Next steps extraction',
    archetype: 'Action items',
    task_type: 'structured_output',
    difficulty: 2,
    instruction: 'Extract committed next steps as JSON: action, owner, due_date.',
    input_context:
      '[CUSTOMER] asked [REP] to send the pricing worksheet by Friday. [REP] will schedule the exec sponsor call for June 18.',
    gold_answer:
      '[{"action":"Send pricing worksheet","owner":"[REP]","due_date":"Friday"},{"action":"Schedule exec sponsor call","owner":"[REP]","due_date":"June 18"}]',
    scorer_type: 'structured_field',
    source: 'anonymized_real',
    tags: ['renewal', 'next-steps'],
  },
  {
    id: 'scn_meddic',
    title: 'MEDDIC qualification fields',
    archetype: 'Deal qualification',
    task_type: 'structured_output',
    difficulty: 3,
    instruction: 'Populate MEDDIC fields (metrics, economic_buyer, decision_criteria, pain) as JSON.',
    input_context:
      "[CUSTOMER] needs to cut forecast prep by 30% before Q4. The VP of RevOps signs off. They'll decide on security review and time-to-value. Pain: regional spreadsheets don't reconcile.",
    gold_answer:
      '{"metrics":"cut forecast prep 30%","economic_buyer":"VP RevOps","decision_criteria":["security review","time-to-value"],"pain":"regional spreadsheet reconciliation"}',
    scorer_type: 'structured_field',
    source: 'anonymized_real',
    tags: ['meddic', 'qualification'],
  },
  {
    id: 'scn_rag',
    title: 'Product question grounding',
    archetype: 'Grounded Q&A',
    task_type: 'rag_qa',
    difficulty: 2,
    instruction:
      'Using only the provided product context, answer this question: Can a Domo custom app read and write AppDB data through mapped aliases, and can Code Engine call both internal and external APIs? If the context is insufficient, say so.',
    input_context:
      'AppDB collections store app documents accessible via mapped aliases. Code Engine calls internal APIs with codeengine.sendRequest and external APIs with codeengine.axios.',
    gold_answer:
      'Yes. A custom app reads and writes AppDB documents through mapped aliases, and Code Engine can call both internal and external APIs.',
    scorer_type: 'reference_similarity',
    source: 'synthetic',
    tags: ['rag', 'product-docs'],
  },
  {
    id: 'scn_summary',
    title: 'Discovery call summary',
    archetype: 'Call summary',
    task_type: 'summarization',
    difficulty: 2,
    instruction: 'Summarize the call in 4 bullets: goal, blocker, decision process, follow-up.',
    input_context:
      "[CUSTOMER] wants to reduce manual forecast prep before Q4. Blocker: inconsistent regional spreadsheet formats. Legal and RevOps must approve data movement. [REP] will send a secure architecture diagram.",
    gold_answer:
      'Goal: reduce manual forecast prep. Blocker: inconsistent regional spreadsheets. Decision: Legal + RevOps approval. Follow-up: rep sends secure architecture diagram.',
    scorer_type: 'reference_similarity',
    source: 'anonymized_real',
    tags: ['discovery'],
  },
  {
    id: 'scn_email',
    title: 'Follow-up email draft',
    archetype: 'Email drafting',
    task_type: 'reasoning_multistep',
    difficulty: 3,
    instruction: 'Draft a concise, personalized follow-up email referencing the next steps and pain.',
    input_context:
      "Call recap: [CUSTOMER] wants 30% faster forecast prep, worried about security review. Agreed next steps: pricing worksheet Friday, exec call June 18.",
    gold_answer:
      'A short, warm email that thanks [CUSTOMER], restates the 30% goal, acknowledges the security review, confirms the pricing worksheet by Friday and the June 18 exec call, and offers help.',
    scorer_type: 'reference_similarity',
    source: 'anonymized_real',
    tags: ['email', 'follow-up'],
  },

  /* ---- Agentic / multi-step archetypes (draft for review) ---- */
  {
    id: 'scn_actionplan',
    title: 'Deal action plan',
    archetype: 'Action plan',
    task_type: 'agentic',
    difficulty: 3,
    instruction:
      'From the call, produce an ordered action plan. For each step give owner, dependency, and due date. Return a numbered list.',
    input_context:
      '[CUSTOMER] (VP RevOps) wants a POC live before the Q4 board review on Oct 15. Needs a security review (~2 weeks), data access from [SYSTEM_A] and [SYSTEM_B], and sign-off from [LEGAL]. [REP] will provide the architecture doc; [SE] will scope the POC; procurement starts after security clears.',
    gold_answer:
      '1) [REP] send architecture doc — no dependency, by Friday. 2) [LEGAL] security review — depends on architecture doc, ~2 weeks. 3) [SE] scope POC — parallel, by next Wednesday. 4) Provision data access to [SYSTEM_A]/[SYSTEM_B] — depends on security review. 5) Build POC — depends on data access + scope. 6) Procurement — depends on security clearing. 7) POC live and board-review prep before Oct 15.',
    scorer_type: 'reference_similarity',
    source: 'synthetic',
    tags: ['agentic', 'planning', 'renewal'],
  },
  {
    id: 'scn_crmsync',
    title: 'CRM update synthesis',
    archetype: 'CRM sync',
    task_type: 'agentic',
    difficulty: 3,
    instruction:
      'Return JSON with two keys: "crm_fields" {stage, close_date, amount, next_step} and "tasks" (array of {title, owner, due}).',
    input_context:
      '[CUSTOMER] verbally committed to a $120k annual deal, targeting close at the end of next month pending procurement. Next: [REP] sends the order form Monday; [SE] schedules the security review this week.',
    gold_answer:
      '{"crm_fields":{"stage":"Negotiation","close_date":"end of next month","amount":"$120k ARR","next_step":"Send order form"},"tasks":[{"title":"Send order form","owner":"[REP]","due":"Monday"},{"title":"Schedule security review","owner":"[SE]","due":"this week"}]}',
    scorer_type: 'structured_field',
    source: 'synthetic',
    tags: ['agentic', 'crm', 'structured'],
  },
  {
    id: 'scn_techpov',
    title: 'Technical POV / architecture rec',
    archetype: 'Architecture POV',
    task_type: 'agentic',
    difficulty: 3,
    instruction:
      'Recommend a Domo architecture for the customer: connectors, data flow (ETL/modeling), and delivery/embed approach — with a one-line rationale for each.',
    input_context:
      '[CUSTOMER] keeps sales data in [SYSTEM_A] (a CRM) and finance in [SYSTEM_B]. They have ~200 external partners who must each see only their own data in a branded portal. Near-real-time is not required; a daily refresh is fine.',
    gold_answer:
      'Connectors: [SYSTEM_A] + [SYSTEM_B] cloud connectors on a daily schedule (daily refresh fits scheduled jobs). ETL: Magic ETL to join + model with partner_id as the row key (one governed dataset). Delivery: embedded analytics with programmatic filters / PDP keyed on partner_id inside a branded embed portal (enforces per-partner isolation + branded external access).',
    scorer_type: 'reference_similarity',
    source: 'synthetic',
    tags: ['agentic', 'technical', 'architecture'],
  },
  {
    id: 'scn_objplaybook',
    title: 'Objection-handling playbook',
    archetype: 'Objection playbook',
    task_type: 'agentic',
    difficulty: 3,
    instruction:
      'Plan a 3-step response to the objection: (1) a discovery question to ask, (2) a proof point to present, (3) a concrete next step.',
    input_context:
      "[CUSTOMER]: 'Your price is higher than [COMPANY_B], and we already sank budget into a BI tool we own.'",
    gold_answer:
      "1) Discovery: ask what their current BI tool can't do today that's costing time or deals. 2) Proof: a TCO/ROI comparison plus a capability [COMPANY_B] lacks (e.g., governed embedded external sharing, app platform). 3) Next step: scope a side-by-side POC on one high-value use case to quantify value against the sunk cost.",
    scorer_type: 'reference_similarity',
    source: 'synthetic',
    tags: ['agentic', 'objection', 'competitive'],
  },
  {
    id: 'scn_meetingprep',
    title: 'Account meeting-prep brief',
    archetype: 'Meeting prep',
    task_type: 'agentic',
    difficulty: 3,
    instruction:
      'Produce a meeting-prep brief: attendees & roles, the meeting goal, top 2 risks, 3 discovery questions, and materials to bring.',
    input_context:
      'Upcoming call with [CUSTOMER]: the economic buyer ([VP_FINANCE]) is joining for the first time; prior calls with [CHAMPION] (analytics lead) went well. Open risks: no executive sponsor confirmed, and competitor [COMPANY_C] is also in the evaluation. Goal: secure a POC commitment.',
    gold_answer:
      'Attendees: [VP_FINANCE] (economic buyer), [CHAMPION] (analytics lead), [REP], [SE]. Goal: secure POC commitment + executive sponsorship. Risks: (1) no confirmed exec sponsor, (2) [COMPANY_C] competing. Questions: what outcome would make this a win for finance; what is the timeline/budget cycle; how will they decide between options. Materials: ROI summary, POC scope, [COMPANY_C] differentiation one-pager.',
    scorer_type: 'reference_similarity',
    source: 'synthetic',
    tags: ['agentic', 'meeting-prep'],
  },
  {
    id: 'scn_displacement',
    title: 'Competitive displacement plan',
    archetype: 'Displacement plan',
    task_type: 'agentic',
    difficulty: 3,
    instruction:
      'Given the incumbent, produce a displacement plan: (1) likely gaps in the incumbent, (2) a migration path, (3) two ROI talking points.',
    input_context:
      '[CUSTOMER] runs [COMPANY_B] for dashboards but complains about slow external/partner sharing and high per-seat cost as they scale toward 500 users.',
    gold_answer:
      'Gaps: governed external/partner sharing and per-seat cost at scale. Migration: parallel-run a top dashboard set in Domo, validate parity, then cut over use case by use case, reusing existing data sources via connectors. ROI: (1) consumption/flat pricing vs per-seat at 500 users, (2) governed embedded external sharing removes the current workaround cost.',
    scorer_type: 'reference_similarity',
    source: 'synthetic',
    tags: ['agentic', 'competitive', 'displacement'],
  },
];

/* ------------------------------------------------------------------ *
 * Model registry — frontier anchor + secondary + open-weight tiers.
 * Only Llama + DeepSeek are runnable live (smoke-tested); the rest
 * anchor the comparison via seeded evidence until profiles land.
 * ------------------------------------------------------------------ */
// Locked 8-model lineup. All routed via the Converse API on bedrock-runtime
// (Bearer-key auth) — verified live Jun 5 (all return 200): Claude Sonnet 4.6,
// Nova Pro (inference profile), Llama 3.3 70B, DeepSeek V3.2, Kimi K2.5,
// GLM 4.7, Qwen3 235B, MiniMax M2.1. Model ids confirmed against the live
// Bedrock catalog (ListFoundationModels).
export const demoModelConfigs: ModelConfig[] = [
  {
    id: 'cfg_claude',
    label: 'Claude Sonnet 4.6 — zero-shot',
    short_label: 'Claude Sonnet 4.6',
    vendor: 'Anthropic',
    bedrock_model_id: 'us.anthropic.claude-sonnet-4-6',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'frontier',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    supports_prompt_cache: true,
    price_per_1k_input: 0.003,
    price_per_1k_output: 0.015,
    runnable: true,
    status: 'ready',
    note: 'Frontier anchor (O3). Uses an inference profile id as the chat-completions model.',
  },
  {
    id: 'cfg_nova',
    label: 'Amazon Nova Pro — zero-shot',
    short_label: 'Nova Pro',
    vendor: 'Amazon',
    bedrock_model_id: 'us.amazon.nova-pro-v1:0',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'secondary',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    supports_prompt_cache: true,
    price_per_1k_input: 0.0008,
    price_per_1k_output: 0.0032,
    runnable: true,
    status: 'ready',
    note: 'Secondary tier.',
  },
  {
    id: 'cfg_llama',
    label: 'Llama 3.3 70B Instruct — zero-shot',
    short_label: 'Llama 3.3 70B',
    vendor: 'Meta',
    bedrock_model_id: 'meta.llama3-3-70b-instruct-v1:0',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'secondary',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    price_per_1k_input: 0.00072,
    price_per_1k_output: 0.00072,
    runnable: true,
    status: 'ready',
    note: 'Smoke-tested (re-verify after chat-completions switch).',
  },
  {
    id: 'cfg_deepseek',
    label: 'DeepSeek V3.2 — zero-shot',
    short_label: 'DeepSeek V3.2',
    vendor: 'DeepSeek',
    bedrock_model_id: 'deepseek.v3.2',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'open_weight',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    price_per_1k_input: 0.00056,
    price_per_1k_output: 0.00168,
    runnable: true,
    status: 'ready',
    note: 'Strong on structured + multilingual.',
  },
  {
    id: 'cfg_qwen',
    label: 'Qwen3 235B A22B — zero-shot',
    short_label: 'Qwen3 235B',
    vendor: 'Alibaba',
    bedrock_model_id: 'qwen.qwen3-235b-a22b-2507-v1:0',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'open_weight',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    price_per_1k_input: 0.0004,
    price_per_1k_output: 0.0008,
    runnable: true,
    status: 'ready',
    note: 'Flagship Qwen3; verified live via Converse.',
  },
  {
    id: 'cfg_kimi',
    label: 'Kimi K2.5 — zero-shot',
    short_label: 'Kimi K2.5',
    vendor: 'Moonshot AI',
    bedrock_model_id: 'moonshotai.kimi-k2.5',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'open_weight',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    price_per_1k_input: 0.0006,
    price_per_1k_output: 0.0025,
    runnable: true,
    status: 'ready',
    note: 'Agentic/reasoning specialist; verify exact model id.',
  },
  {
    id: 'cfg_glm',
    label: 'GLM 4.7 — zero-shot',
    short_label: 'GLM 4.7',
    vendor: 'Zhipu AI',
    bedrock_model_id: 'zai.glm-4.7',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'open_weight',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    price_per_1k_input: 0.0006,
    price_per_1k_output: 0.0022,
    runnable: true,
    status: 'ready',
    note: 'Autonomous coding, large output window.',
  },
  {
    id: 'cfg_minimax',
    label: 'MiniMax M2.1 — zero-shot',
    short_label: 'MiniMax M2.1',
    vendor: 'MiniMax',
    bedrock_model_id: 'minimax.minimax-m2.1',
    path: 'runtime',
    endpoint: 'runtime',
    tier: 'open_weight',
    intervention_level: 'zeroshot',
    params: { temperature: 0.2, max_tokens: 512 },
    price_per_1k_input: 0.0005,
    price_per_1k_output: 0.0020,
    runnable: true,
    status: 'ready',
    note: 'Verified live via Converse.',
  },
];

export const FRONTIER_CONFIG_ID = 'cfg_claude';
