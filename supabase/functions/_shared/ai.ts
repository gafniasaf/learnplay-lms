// supabase/functions/_shared/ai.ts
// Provider-agnostic AI wrapper for Edge Functions
// Supports Anthropic and OpenAI today, extensible to others via AI_PROVIDER env.

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AIProvider = 'anthropic' | 'openai' | 'azure_openai' | 'none';

/** Telemetry captured per LLM call */
export interface LLMCallMetrics {
  provider: AIProvider;
  model: string;
  tokens?: number;
  latency_ms: number;
  attempts: number;
  cost_usd?: number;
  success: boolean;
  error?: string;
}

/** Pluggable provider interface */
export interface LLMProvider {
  name: AIProvider;
  generateJSON(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    timeoutMs?: number;
    prefillJson?: boolean;
  }): Promise<{ ok: true; text: string; metrics: LLMCallMetrics } | { ok: false; error: string; metrics: LLMCallMetrics }>;
  
  generateText(opts: {
    system?: string;
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    timeoutMs?: number;
  }): Promise<{ ok: true; text: string; metrics: LLMCallMetrics } | { ok: false; error: string; metrics: LLMCallMetrics }>;
}

function parseIntEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(key);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(value, min), max);
}

function pickProvider(): AIProvider {
  const explicit = (Deno.env.get('AI_PROVIDER') || '').toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai' || explicit === 'azure_openai') return explicit as AIProvider;
  if (Deno.env.get('ANTHROPIC_API_KEY')) return 'anthropic';
  if (Deno.env.get('OPENAI_API_KEY')) return 'openai';
  return 'none';
}

const PROVIDER = pickProvider();
const PROVIDER_STATE: Record<AIProvider, { failures: number; lastFailureAt: number }> = {
  anthropic: { failures: 0, lastFailureAt: 0 },
  openai: { failures: 0, lastFailureAt: 0 },
  azure_openai: { failures: 0, lastFailureAt: 0 },
  none: { failures: 0, lastFailureAt: 0 },
};

export function getProvider(): AIProvider {
  return PROVIDER;
}

export function getModel(): string {
  switch (PROVIDER) {
    case 'anthropic':
      return Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
    case 'openai':
      return Deno.env.get('OPENAI_COURSE_MODEL') || Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-5.1-mini';
    case 'azure_openai':
      return Deno.env.get('AZURE_OPENAI_DEPLOYMENT') || 'gpt-5.1';
    default:
      return 'none';
  }
}

function getModelFor(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic':
      return Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
    case 'openai':
      return Deno.env.get('OPENAI_COURSE_MODEL') || Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-5.1-mini';
    case 'azure_openai':
      return Deno.env.get('AZURE_OPENAI_DEPLOYMENT') || 'gpt-5.1';
    default:
      return 'none';
  }
}

function parseProviderList(raw: string): AIProvider[] {
  return raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => (p === 'anthropic' || p === 'openai' || p === 'azure_openai' ? (p as AIProvider) : 'none'))
    .filter((p) => p !== 'none');
}

function isProviderConfigured(provider: AIProvider): boolean {
  if (provider === 'anthropic') return !!Deno.env.get('ANTHROPIC_API_KEY');
  if (provider === 'openai') return !!Deno.env.get('OPENAI_API_KEY');
  if (provider === 'azure_openai') return !!Deno.env.get('AZURE_OPENAI_ENDPOINT') && !!Deno.env.get('AZURE_OPENAI_API_KEY');
  return false;
}

function getProviderOrder(): AIProvider[] {
  const primary = PROVIDER;
  const fallbackRaw = Deno.env.get('AI_PROVIDER_FALLBACKS') || '';
  const fallbacks = parseProviderList(fallbackRaw);
  const order = [primary, ...fallbacks];
  const unique: AIProvider[] = [];
  for (const p of order) {
    if (!unique.includes(p)) unique.push(p);
  }
  if (!unique.length || unique[0] === 'none') {
    const available: AIProvider[] = [];
    if (isProviderConfigured('anthropic')) available.push('anthropic');
    if (isProviderConfigured('openai')) available.push('openai');
    if (isProviderConfigured('azure_openai')) available.push('azure_openai');
    return available;
  }
  return unique.filter((p) => isProviderConfigured(p));
}

function isRetryableError(message: string): boolean {
  const s = String(message || '').toLowerCase();
  return (
    s.includes('timeout') ||
    s.includes('timed out') ||
    s.includes('rate limit') ||
    s.includes('429') ||
    s.includes('502') ||
    s.includes('503') ||
    s.includes('overloaded') ||
    s.includes('temporarily')
  );
}

function shouldSkipProvider(provider: AIProvider): boolean {
  const threshold = parseIntEnv('AI_CIRCUIT_BREAKER_THRESHOLD', 3, 1, 20);
  const cooldownMs = parseIntEnv('AI_CIRCUIT_BREAKER_COOLDOWN_MS', 120_000, 5_000, 60 * 60 * 1000);
  const state = PROVIDER_STATE[provider];
  if (!state) return false;
  if (state.failures < threshold) return false;
  return Date.now() - state.lastFailureAt < cooldownMs;
}

function recordFailure(provider: AIProvider): void {
  const state = PROVIDER_STATE[provider];
  if (!state) return;
  state.failures += 1;
  state.lastFailureAt = Date.now();
}

function recordSuccess(provider: AIProvider): void {
  const state = PROVIDER_STATE[provider];
  if (!state) return;
  state.failures = 0;
  state.lastFailureAt = 0;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callProviderGenerateJson(
  provider: AIProvider,
  opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    timeoutMs?: number;
    prefillJson?: boolean;
  }
): Promise<{ ok: true; text: string; metrics?: LLMCallMetrics } | { ok: false; error: string; metrics?: LLMCallMetrics }> {
  const { system, prompt, temperature = 0.3, maxTokens = 3600, stopSequences, timeoutMs = 110000, prefillJson = true } = opts;
  const model = getModelFor(provider);
  const startTime = Date.now();
  const attempts = 1;

  try {
    if (provider === 'anthropic') {
      const body = {
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        stop_sequences: stopSequences,
        messages: prefillJson
          ? [
              { role: 'user', content: [{ type: 'text', text: prompt }] },
              { role: 'assistant', content: [{ type: 'text', text: '{' }] },
            ]
          : [
              { role: 'user', content: [{ type: 'text', text: prompt }] },
            ],
      } as any;

      const resp = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      let text = (Array.isArray(data?.content) ? data.content : [])
        .filter((b: any) => b?.type === 'text' && b?.text)
        .map((b: any) => b.text)
        .join('\n');

      if (prefillJson) {
        const trimmedStart = text.trimStart();
        if (trimmedStart && !trimmedStart.startsWith('{')) {
          text = `{${trimmedStart}`;
        } else {
          text = trimmedStart;
        }
      }
      const latency_ms = Date.now() - startTime;
      const tokens = data?.usage?.input_tokens + data?.usage?.output_tokens;
      if (!text?.trim()) return { ok: false, error: 'empty', metrics: { provider, model, tokens, latency_ms, attempts, success: false } };
      return { ok: true, text, metrics: { provider, model, tokens, latency_ms, attempts, success: true } };
    }

    if (provider === 'openai') {
      const resp = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature,
            max_tokens: maxTokens,
            stop: stopSequences,
          }),
        },
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      const latency_ms = Date.now() - startTime;
      const tokens = data?.usage?.prompt_tokens + data?.usage?.completion_tokens;
      if (!text?.trim()) return { ok: false, error: 'empty', metrics: { provider, model, tokens, latency_ms, attempts, success: false } };
      return { ok: true, text, metrics: { provider, model, tokens, latency_ms, attempts, success: true } };
    }

    if (provider === 'azure_openai') {
      const base = Deno.env.get('AZURE_OPENAI_ENDPOINT');
      if (!base) return { ok: false, error: 'azure_endpoint_missing' };
      const url = `${base}/openai/deployments/${model}/chat/completions?api-version=2024-06-01`;
      const resp = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'api-key': Deno.env.get('AZURE_OPENAI_API_KEY')!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            temperature,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
            stop: stopSequences,
          }),
        },
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      const latency_ms = Date.now() - startTime;
      const tokens = data?.usage?.prompt_tokens + data?.usage?.completion_tokens;
      if (!text?.trim()) return { ok: false, error: 'empty', metrics: { provider, model, tokens, latency_ms, attempts, success: false } };
      return { ok: true, text, metrics: { provider, model, tokens, latency_ms, attempts, success: true } };
    }

    return { ok: false, error: 'unsupported_provider' };
  } catch (e: any) {
    const latency_ms = Date.now() - startTime;
    return { ok: false, error: e?.message || String(e), metrics: { provider, model, latency_ms, attempts, success: false, error: e?.message || String(e) } };
  }
}

export async function generateJson(
  opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    timeoutMs?: number;
    prefillJson?: boolean;
  }
): Promise<{ ok: true; text: string; metrics?: LLMCallMetrics } | { ok: false; error: string; metrics?: LLMCallMetrics } > {
  const { system, prompt, temperature = 0.3, maxTokens = 3600, stopSequences, timeoutMs = 110000, prefillJson = true } = opts;

  const providers = getProviderOrder();
  if (!providers.length) return { ok: false, error: 'no_provider' };

  let attempts = 0;
  let lastError = 'generation_failed';
  let lastMetrics: LLMCallMetrics | undefined;
  for (const provider of providers) {
    if (shouldSkipProvider(provider)) continue;
    attempts += 1;
    const res = await callProviderGenerateJson(provider, {
      system,
      prompt,
      maxTokens,
      temperature,
      stopSequences,
      timeoutMs,
      prefillJson,
    });
    if (res.ok) {
      recordSuccess(provider);
      if (res.metrics) res.metrics.attempts = attempts;
      return res;
    }
    lastError = res.error || 'generation_failed';
    if (res.metrics) lastMetrics = res.metrics;
    recordFailure(provider);
    if (!isRetryableError(lastError)) {
      continue;
    }
  }

  return { ok: false, error: lastError, metrics: lastMetrics };
}

async function callProviderChat(
  provider: AIProvider,
  opts: {
    system?: string;
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    timeoutMs?: number;
  }
): Promise<{ ok: true; text: string; metrics?: LLMCallMetrics } | { ok: false; error: string; metrics?: LLMCallMetrics }> {
  const { system = '', messages, temperature = 0.7, maxTokens = 1200, stopSequences, timeoutMs = 60000 } = opts;
  const model = getModelFor(provider);
  const startTime = Date.now();
  const attempts = 1;

  try {
    if (provider === 'anthropic') {
      const converted = messages.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
      const resp = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: converted, stop_sequences: stopSequences }),
        },
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = (Array.isArray(data?.content) ? data.content : [])
        .filter((b: any) => b?.type === 'text' && b?.text)
        .map((b: any) => b.text)
        .join('\n\n');
      if (!text?.trim()) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: 'empty', metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const latency_ms = Date.now() - startTime;
      return { ok: true, text, metrics: { provider, model, latency_ms, attempts, success: true } };
    }

    if (provider === 'openai') {
      const resp = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [system ? { role: 'system', content: system } : undefined, ...messages].filter(Boolean),
            temperature,
            max_tokens: maxTokens,
            stop: stopSequences,
          }),
        },
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text?.trim()) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: 'empty', metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const latency_ms = Date.now() - startTime;
      return { ok: true, text, metrics: { provider, model, latency_ms, attempts, success: true } };
    }

    if (provider === 'azure_openai') {
      const base = Deno.env.get('AZURE_OPENAI_ENDPOINT');
      if (!base) return { ok: false, error: 'azure_endpoint_missing' };
      const url = `${base}/openai/deployments/${model}/chat/completions?api-version=2024-06-01`;
      const resp = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'api-key': Deno.env.get('AZURE_OPENAI_API_KEY')!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [system ? { role: 'system', content: system } : undefined, ...messages].filter(Boolean),
            temperature,
            max_tokens: maxTokens,
            stop: stopSequences,
          }),
        },
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text?.trim()) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: 'empty', metrics: { provider, model, latency_ms, attempts, success: false } };
      }
      const latency_ms = Date.now() - startTime;
      return { ok: true, text, metrics: { provider, model, latency_ms, attempts, success: true } };
    }

    return { ok: false, error: 'unsupported_provider' };
  } catch (e: any) {
    const latency_ms = Date.now() - startTime;
    return { ok: false, error: e?.message || String(e), metrics: { provider, model, latency_ms, attempts, success: false, error: e?.message || String(e) } };
  }
}

export async function chat(
  opts: {
    system?: string;
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    timeoutMs?: number;
  }
): Promise<{ ok: true; text: string } | { ok: false; error: string } > {
  const { system = '', messages, temperature = 0.7, maxTokens = 1200, stopSequences, timeoutMs = 60000 } = opts;
  const providers = getProviderOrder();
  if (!providers.length) return { ok: false, error: 'no_provider' };

  let lastError = 'generation_failed';
  for (const provider of providers) {
    if (shouldSkipProvider(provider)) continue;
    const res = await callProviderChat(provider, {
      system,
      messages,
      temperature,
      maxTokens,
      stopSequences,
      timeoutMs,
    });
    if (res.ok) {
      recordSuccess(provider);
      return { ok: true, text: res.text };
    }
    lastError = res.error || 'generation_failed';
    recordFailure(provider);
    if (!isRetryableError(lastError)) {
      continue;
    }
  }

  return { ok: false, error: lastError };
}
