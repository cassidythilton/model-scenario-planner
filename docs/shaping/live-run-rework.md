---
shaping: true
---

# Live-Run Experience + Metrics Rework — Shaping

Rework the Playground's live run so it reads as **active, legible work** (API calls, activity, logging, animation) à la `frontier-inference-architecture`'s live bench, and re-assess the per-card metrics.

## Source

> Let's now dig into the live scenario experience. Right now it's a very serial experience with little context or animation. How can we incorporate the api calls, activity, logging etc. The frontier-inference-architecture app does an excellent job here. Also, once again we need to re-assess the metrics. Are these the correct four? Do we need to add additional metrics?

## CURRENT

- `runLive` fires all selected models with `Promise.all`; each `ModelResultCard` shows a static "Calling Bedrock through Code Engine…" placeholder, then fills once state propagates.
- No activity log, no per-model lifecycle, no elapsed timer, no reveal animation.
- Metrics (4 tiles): **Quality · Cost/task · Latency · Tokens**.
- **Backend reality:** the `bedrock-broker` CE function is a single non-streaming request/response. It returns `latency_ms` (total wall-clock), `input_tokens`, `output_tokens`, `cost_usd`, `request_id`. **No token streaming, no TTFT.**

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Live run shows the work happening (API-call lifecycle), not just a spinner | Core goal |
| R1 | Per-model lifecycle with phases + a live elapsed timer (queued → calling → scoring → done/error) | Must-have |
| R2 | A global run console / event feed aggregating activity across models (newest-first), with request_id + errors | Must-have |
| R3 | Output reveals with a light animation on arrival; in-flight cards read as active | Must-have |
| R4 | Metrics reflect the cheaper-model decision and stay honest about the non-streaming backend | Core goal |
| R4.1 | Keep Quality (Δ vs anchor) and Cost/task (× cheaper) | Must-have |
| R4.2 | Add Throughput (tokens/sec) derived from output tokens ÷ total latency | Must-have |
| R4.3 | Surface normalized $/1k output + request_id (reconciliation) + token split as secondary detail | Must-have |
| R4.4 | No fabricated TTFT — label latency as total wall-clock | Must-have |
| R5 | Stagger launches slightly so the feed reads as a stream (small concurrency feel) | Nice-to-have |
| R6 | Don't regress existing persistence, timestamps, scoring, or localStorage view | Must-have |

## Shapes

### A: Card-local enrichment only
Phase chip + elapsed timer + throughput metric inside each card. No global console.

### B: Card enrichment + global Run Console (selected)
A = card lifecycle/metrics, **plus** a global event-feed console fed by staged lifecycle events emitted around the single CE call, plus a light reveal animation and a small launch stagger. Mirrors Frontier's live feed within a request/response backend.

### C: True SSE token streaming
Stream tokens from CE like Frontier's SSE bench.

## Fit Check

| Req | Requirement | Status | A | B | C |
|-----|-------------|--------|---|---|---|
| R0 | Live run shows the work happening, not just a spinner | Core goal | ✅ | ✅ | ✅ |
| R1 | Per-model lifecycle + live elapsed timer | Must-have | ✅ | ✅ | ✅ |
| R2 | Global run console / event feed across models | Must-have | ❌ | ✅ | ✅ |
| R3 | Output reveal animation; in-flight cards read active | Must-have | ✅ | ✅ | ✅ |
| R4 | Metrics reflect decision + honest about backend | Core goal | ✅ | ✅ | ❌ |
| R5 | Stagger launches so feed reads as a stream | Nice-to-have | ❌ | ✅ | ✅ |
| R6 | No regression of persistence/scoring/view | Must-have | ✅ | ✅ | ❌ |

**Notes:**
- A fails R2: no global feed.
- C fails R4/R6 by feasibility: the `bedrock-broker` CE function is request/response — there is no streaming token channel to consume, and faking TTFT/stream would violate R4.4. Real streaming would require a different backend transport (out of scope).

**Decision: Shape B.** Emit client-side lifecycle events around the single CE call (queued → calling → scoring → done/error), drive a global Run Console + per-card phase/elapsed, reveal output on arrival, stagger launches ~180ms. Metrics honest to a non-streaming backend.

## Detail B: Affordances

| Part | Mechanism |
|------|-----------|
| **B1** | **Run session state** — `runStates: {modelId → {phase, startedAt, endedAt}}` + `events: RunEvent[]` + a `nowTick` interval (100ms) live only while runs are in flight |
| **B2** | **Staged runLive** — per model: stagger `idx*180ms` → emit `queued`/`POST /converse`; await `runScenario`; emit `200 · {latency} · {tok} · req {id}` or error; phase→`scoring`; await `evaluateRun`; emit `scored {score}`; phase→`done` |
| **B3** | **RunConsole** — global newest-first event feed (mono, tier dot, level color, timestamp, request_id), collapsible, lives atop the compare grid |
| **B4** | **Card lifecycle** — phase chip ("Calling Bedrock…", "Scoring…") + ticking elapsed timer while running; output fades in on arrival |
| **B5** | **Metric rework** — tiles become **Quality · Cost/task · Throughput (tok/s) · Latency (total)**; foot adds `$/1k out`, `in/out tokens`, `req-id` |

## Metrics decision (R4)

| Tile / field | Keep? | Why |
|---|---|---|
| Quality (Δ vs anchor) | keep | primary outcome |
| Cost / task (× cheaper) | keep | core economic axis |
| **Throughput (tok/s)** | **add (replaces raw Tokens tile)** | output_tokens ÷ (latency/1000); decision-relevant for latency-sensitive workloads; raw token *count* has low standalone value |
| Latency (total) | keep, relabel | honest: total wall-clock, not TTFT (we don't stream) |
| **$/1k output** | add → foot | normalized, apples-to-apples blended cost |
| **request_id** | add → foot | reconciliation against Bedrock/CloudWatch logs |
| in/out token split | keep → foot | context for cost/throughput |

**Not added:** cached-input share (would need a `bedrock-broker` change to capture `cacheReadInputTokens` + a CE redeploy) and TTFT (no streaming). Both noted as future broker work.
