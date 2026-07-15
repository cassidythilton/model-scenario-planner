---
shaping: true
---

# LLM Market-Fit Harness — Overhaul Frame

The "why" behind upgrading the current demo shell into a comprehensive comparison harness. Stakeholder-level, concise. Ground truth for Problem and Outcome lives here; requirements and shapes live in [`shaping.md`](./shaping.md).

---

## Source

> reference the original docs provided on this app... i feel like the current state of the app is too simple and needs a complete overhaul/upgrade. what would go into a comprehensive comparisons of open source/secondary large language models performance vs frontier models in various scenarios? what would the metrics be? how would we build a compelling experience to showcase the scenarios, etc.? use your shaping skill to capture the requirements and tease apart the key parts of the solution that i have specified here.

The original theory that started the project (from `docs/frontier model compare.txt`):

> i have a theory that i want to test out.. open source/secondary large language models performance vs frontier models in various scenarios. i believe that the cost of frontier models is going to push a lot of demand toward secondary models for sake of cost. i also believe that with the proper amount of context and post-training configuration on secondary models will produce similar accuracy to frontier models... i have access to amazon bedrock and can run various scenarios and testing there.

> this is more of a general what's true about the market and whether the idea is worth pursuing investigation. i'd like to build a react app, in domo, interacting with bedrock, that executes various scenarios with the appropriate evals, etc. i should be able to automate mass scenarios but also run manual ones as well. these should be real world scenarios that i would run into in actual real life conversations with various customers at domo.

Methodology guardrails surfaced in the source conversation:

> pre-register what "match" means before you run anything... apply the same context engineering to the frontier model... The honest comparison is configured-secondary vs. configured-frontier... segment by task type, because the gap behaves completely differently across them... The deliverable should be a cost-performance Pareto frontier per task type, not a leaderboard.

---

## Problem

The project has rich written specs (`llm-harness-scope-v0.1.md`, `llm-harness-build-plan-v0.1.md`) but the **implemented app is a Phase-0 demo shell** that doesn't yet test the theory:

- **It's synthetic, not empirical.** The Results map and Scenario library are driven by ~135 hardcoded runs in `app/src/data/demoHarness.ts`. Scores are authored to illustrate the thesis, not measured. The "output" of a demo run is literally the gold answer echoed back.
- **One thin live path.** Only `runScenario` (Bedrock Converse) is wired, and only 2 of 5 models are runnable. The frontier anchor isn't runnable. The open-weight / mantle path is unused.
- **No persistence.** AppDB wrappers exist but nothing reads/writes them; session state is in-memory and lost on reload.
- **No real eval engine.** Live scoring is a hardcoded constant for everything except a single substring match. No structured-field F1, no embedding similarity, no human-review queue.
- **No batch harness.** The "automate mass scenarios" requirement — the core of a market investigation — has no runner, queue, cost ceiling, or staged execution.
- **No authoring or real scenarios.** The library is read-only; there's no Gong ingestion or anonymization, so the "real world Domo customer scenarios" requirement is unmet.
- **The comparison isn't comprehensive.** Effectively one intervention level (zero-shot), no symmetric control, no pre-registration — so any result it produces would not be defensible.

Net: the app **demonstrates a UX** but cannot yet **answer the business question** or **stand up as evidence** in a customer/market conversation.

---

## Outcome

A harness that does three things well, corresponding to the three questions in the source:

1. **Comprehensive comparison** — runs real Domo-customer scenarios across a matrix of *frontier × secondary × open-weight* models and a *configuration ladder* (zero-shot → few-shot → RAG → fine-tuned), with a symmetric, pre-registered, segmented-by-task-type design so the result is defensible rather than rigged.
2. **The right metrics** — not a single accuracy number, but a multi-axis picture per task type: quality, cost, latency, reliability/variance, failure-mode severity, and the derived comparatives (gap-to-frontier, quality-per-dollar, Pareto frontier, gap-closing-by-intervention).
3. **A compelling experience** — a polished, narrative showcase that turns the data into a "map" (where the cheaper-model thesis holds and where it breaks), plus a live side-by-side playground that doubles as the surface to demo in real customer conversations, with drill-down into actual model outputs vs. gold.

Success = the app can run a real batch, persist it, score it honestly, and render a defensible cost-vs-accuracy map by task type that a Domo SE could put in front of a customer.
