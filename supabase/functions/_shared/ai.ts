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

function pickProvider(): AIProvider {
  const explicit = (Deno.env.get('AI_PROVIDER') || '').toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai' || explicit === 'azure_openai') return explicit as AIProvider;
  if (Deno.env.get('ANTHROPIC_API_KEY')) return 'anthropic';
  if (Deno.env.get('OPENAI_API_KEY')) return 'openai';
  return 'none';
}

const PROVIDER = pickProvider();

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

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    // @ts-ignore - pass signal only to fetch branches
    (p as any).signal = ctrl.signal;
    return await p;
  } finally {
    clearTimeout(t);
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

  if (PROVIDER === 'none') return { ok: false, error: 'no_provider' };

  const startTime = Date.now();
  let attempts = 1;

  try {
    if (PROVIDER === 'anthropic') {
      const body = {
        model: getModel(),
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

      const resp = await withTimeout(
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        }),
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider: 'anthropic', model: getModel(), latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = (Array.isArray(data?.content) ? data.content : [])
        .filter((b: any) => b?.type === 'text' && b?.text)
        .map((b: any) => b.text)
        .join('\n');
      const latency_ms = Date.now() - startTime;
      const tokens = data?.usage?.input_tokens + data?.usage?.output_tokens;
      if (!text?.trim()) return { ok: false, error: 'empty', metrics: { provider: 'anthropic', model: getModel(), tokens, latency_ms, attempts, success: false } };
      return { ok: true, text, metrics: { provider: 'anthropic', model: getModel(), tokens, latency_ms, attempts, success: true } };
    }

    if (PROVIDER === 'openai') {
      const resp = await withTimeout(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: getModel(),
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature,
            max_tokens: maxTokens,
            stop: stopSequences,
          }),
        }),
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider: 'openai', model: getModel(), latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      const latency_ms = Date.now() - startTime;
      const tokens = data?.usage?.prompt_tokens + data?.usage?.completion_tokens;
      if (!text?.trim()) return { ok: false, error: 'empty', metrics: { provider: 'openai', model: getModel(), tokens, latency_ms, attempts, success: false } };
      return { ok: true, text, metrics: { provider: 'openai', model: getModel(), tokens, latency_ms, attempts, success: true } };
    }

    if (PROVIDER === 'azure_openai') {
      const base = Deno.env.get('AZURE_OPENAI_ENDPOINT');
      const deployment = getModel();
      if (!base) return { ok: false, error: 'azure_endpoint_missing' };
      const url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
      const resp = await withTimeout(
        fetch(url, {
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
        }),
        timeoutMs,
      );
      if (!resp.ok) {
        const latency_ms = Date.now() - startTime;
        return { ok: false, error: await resp.text(), metrics: { provider: 'azure_openai', model: getModel(), latency_ms, attempts, success: false } };
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      const latency_ms = Date.now() - startTime;
      const tokens = data?.usage?.prompt_tokens + data?.usage?.completion_tokens;
      if (!text?.trim()) return { ok: false, error: 'empty', metrics: { provider: 'azure_openai', model: getModel(), tokens, latency_ms, attempts, success: false } };
      return { ok: true, text, metrics: { provider: 'azure_openai', model: getModel(), tokens, latency_ms, attempts, success: true } };
    }

    return { ok: false, error: 'unsupported_provider' };
  } catch (e: any) {
    const latency_ms = Date.now() - startTime;
    return { ok: false, error: e?.message || String(e), metrics: { provider: PROVIDER, model: getModel(), latency_ms, attempts, success: false, error: e?.message || String(e) } };
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
  if (PROVIDER === 'none') return { ok: false, error: 'no_provider' };

  try {
    if (PROVIDER === 'anthropic') {
      const converted = messages.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
      const resp = await withTimeout(
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: getModel(), max_tokens: maxTokens, temperature, system, messages: converted, stop_sequences: stopSequences }),
        }),
        timeoutMs,
      );
      if (!resp.ok) return { ok: false, error: await resp.text() };
      const data = await resp.json();
      const text = (Array.isArray(data?.content) ? data.content : [])
        .filter((b: any) => b?.type === 'text' && b?.text)
        .map((b: any) => b.text)
        .join('\n\n');
      if (!text?.trim()) return { ok: false, error: 'empty' };
      return { ok: true, text };
    }

    if (PROVIDER === 'openai') {
      const resp = await withTimeout(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: getModel(),
            messages: [system ? { role: 'system', content: system } : undefined, ...messages].filter(Boolean),
            temperature,
            max_tokens: maxTokens,
            stop: stopSequences,
          }),
        }),
        timeoutMs,
      );
      if (!resp.ok) return { ok: false, error: await resp.text() };
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text?.trim()) return { ok: false, error: 'empty' };
      return { ok: true, text };
    }

    if (PROVIDER === 'azure_openai') {
      const base = Deno.env.get('AZURE_OPENAI_ENDPOINT');
      const deployment = getModel();
      if (!base) return { ok: false, error: 'azure_endpoint_missing' };
      const url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
      const resp = await withTimeout(
        fetch(url, {
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
        }),
        timeoutMs,
      );
      if (!resp.ok) return { ok: false, error: await resp.text() };
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text?.trim()) return { ok: false, error: 'empty' };
      return { ok: true, text };
    }

    return { ok: false, error: 'unsupported_provider' };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
