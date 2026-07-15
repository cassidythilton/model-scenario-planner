/**
 * Code Engine package: bedrock-broker
 *
 * Brokers Amazon Bedrock traffic for the LLM Market-Fit Harness.
 *
 * ── Auth (v1.0.7) ────────────────────────────────────────────────────────────
 * Uses a **Bedrock long-term API key** (Bearer token), NOT a Domo Account and
 * NOT SigV4. Rationale: API-created CE functions cannot bind an Account input
 * for app invocation (the input alias is stripped → "unmapped account alias"),
 * and getAccount() cannot reach an un-wired account. Bearer auth sidesteps all
 * of that. The key is injected at deploy time by build-payload.mjs (placeholder
 * substitution); it is never committed in source.
 *
 * Paths:
 *   - runtime (default): Converse API — POST /model/{id}/converse  (Claude/Nova/Llama/DeepSeek)
 *   - mantle:            OpenAI Chat-Completions — POST {mantle}/openai/v1/chat/completions
 *
 * Primary function: runScenario(scenario, modelConfig, repeatIndex, dryRun)
 */

const codeengine = require('codeengine');

async function runScenario(scenario, modelConfig, repeatIndex, dryRun) {
  const BEDROCK_API_KEY = '__BEDROCK_API_KEY__';
  const DEFAULT_REGION = 'us-east-2';

  // ── prompt assembly ──
  const buildUserText = (sc, mc) => {
    const parts = [];
    if (mc.rag_context) parts.push(`Context:\n${mc.rag_context}\n`);
    if (sc.input_context) parts.push(`Input:\n${sc.input_context}\n`);
    parts.push(sc.instruction || '');
    return parts.join('\n');
  };

  // Converse body (runtime). content is an array of {text} blocks.
  const buildConverseBody = (sc, mc, userText) => {
    const params = mc.params || {};
    const messages = [];
    if (Array.isArray(mc.fewshot_examples)) {
      for (const ex of mc.fewshot_examples) {
        if (ex && ex.input != null) messages.push({ role: 'user', content: [{ text: String(ex.input) }] });
        if (ex && ex.output != null) messages.push({ role: 'assistant', content: [{ text: String(ex.output) }] });
      }
    }
    messages.push({ role: 'user', content: [{ text: userText }] });
    return {
      messages,
      inferenceConfig: {
        maxTokens: params.max_tokens || 1024,
        temperature: params.temperature != null ? params.temperature : 0.2,
      },
    };
  };

  // OpenAI chat-completions body (mantle). content is a string.
  const buildChatBody = (sc, mc, userText) => {
    const params = mc.params || {};
    const messages = [];
    if (Array.isArray(mc.fewshot_examples)) {
      for (const ex of mc.fewshot_examples) {
        if (ex && ex.input != null) messages.push({ role: 'user', content: String(ex.input) });
        if (ex && ex.output != null) messages.push({ role: 'assistant', content: String(ex.output) });
      }
    }
    messages.push({ role: 'user', content: userText });
    return {
      model: mc.bedrock_model_id,
      messages,
      max_tokens: params.max_tokens || 1024,
      temperature: params.temperature != null ? params.temperature : 0.2,
    };
  };

  const estimateTokens = (text) => Math.ceil((text || '').length / 4);
  const computeCost = (inTok, outTok, mc) =>
    (inTok / 1000) * (Number(mc.price_per_1k_input) || 0) +
    (outTok / 1000) * (Number(mc.price_per_1k_output) || 0);

  const timestamp = new Date().toISOString();
  const baseRun = {
    scenario_id: scenario && scenario.id,
    repeat_index: repeatIndex || 0,
    model_id_resolved: modelConfig && modelConfig.bedrock_model_id,
    timestamp,
  };

  try {
    const userText = buildUserText(scenario, modelConfig);

    if (dryRun) {
      const inputTokens = estimateTokens(userText);
      const estOutput = (modelConfig.params && modelConfig.params.max_tokens) || 1024;
      return {
        status: 'dry_run',
        run: { ...baseRun, resolved_prompt: userText, input_tokens: inputTokens, output_tokens: estOutput, cost_usd: computeCost(inputTokens, estOutput, modelConfig), latency_ms: 0 },
        error: null,
      };
    }

    const region = (modelConfig && modelConfig.region) || DEFAULT_REGION;
    const endpointFamily = modelConfig.endpoint || modelConfig.path || 'runtime';
    const isMantle = endpointFamily === 'mantle';
    const url = isMantle
      ? `https://bedrock-mantle.${region}.api.aws/openai/v1/chat/completions`
      : `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelConfig.bedrock_model_id)}/converse`;
    const body = isMantle
      ? buildChatBody(scenario, modelConfig, userText)
      : buildConverseBody(scenario, modelConfig, userText);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${BEDROCK_API_KEY}` };

    const started = Date.now();
    let response;
    try {
      response = await codeengine.axios({ method: 'POST', url, headers, data: JSON.stringify(body), timeout: 120000 });
    } catch (err) {
      const httpStatus = err && err.response && err.response.status;
      const errData = err && err.response && err.response.data;
      const errType = errData && (errData.__type || (errData.error && errData.error.message) || errData.message);
      if (httpStatus === 429 || (errType && String(errType).includes('Throttling'))) {
        return { status: 'throttled', run: baseRun, error: 'Bedrock throttled the request.' };
      }
      const detail = (errData && JSON.stringify(errData)) || (err && err.message) || String(err);
      return { status: 'error', run: baseRun, error: `Bedrock call failed: ${detail}` };
    }
    const latencyMs = Date.now() - started;

    const data = response.data || {};
    let outputText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    if (isMantle) {
      const choice = Array.isArray(data.choices) && data.choices[0];
      outputText = (choice && choice.message && choice.message.content) || '';
      const usage = data.usage || {};
      inputTokens = usage.prompt_tokens || 0;
      outputTokens = usage.completion_tokens || 0;
    } else {
      const contentArr = data.output && data.output.message && data.output.message.content;
      outputText = Array.isArray(contentArr) ? contentArr.map((c) => c.text || '').join('') : '';
      const usage = data.usage || {};
      inputTokens = usage.inputTokens || 0;
      outputTokens = usage.outputTokens || 0;
    }
    const respHeaders = response.headers || {};
    const requestId = respHeaders['x-amzn-requestid'] || respHeaders['x-request-id'] || data.id || null;

    return {
      status: 'ok',
      run: {
        ...baseRun,
        output_text: outputText,
        resolved_prompt: userText,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: latencyMs,
        cost_usd: computeCost(inputTokens, outputTokens, modelConfig),
        request_id: requestId,
      },
      error: null,
    };
  } catch (err) {
    return { status: 'error', run: baseRun, error: (err && err.message) || String(err) };
  }
}

module.exports = { runScenario };
