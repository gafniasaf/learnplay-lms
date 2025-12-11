// Minimal provider abstraction for text generation with safety guards.

export interface LlmProvider {
  generateText(input: { prompt: string; maxTokens?: number; temperature?: number }): Promise<{ text: string; finishReason?: string }>;
}

function getEnv(name: string): string | undefined {
  // @ts-ignore
  return (globalThis as any).Deno?.env.get(name);
}

async function openaiGenerate(prompt: string, opts: { model: string; apiKey: string; maxTokens?: number; temperature?: number }) {
  const endpoint = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: opts.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0.2,
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI error ${res.status}`);
  const text = json?.choices?.[0]?.message?.content || '';
  const reason = json?.choices?.[0]?.finish_reason || '';
  return { text, finishReason: reason };
}

async function anthropicGenerate(prompt: string, opts: { model: string; apiKey: string; maxTokens?: number; temperature?: number }) {
  const endpoint = 'https://api.anthropic.com/v1/messages';
  const body: any = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0.2,
    messages: [{ role: 'user', content: prompt }],
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Anthropic error ${res.status}`);
  const text = json?.content?.[0]?.text || '';
  const reason = json?.stop_reason || '';
  return { text, finishReason: reason };
}

export function getProvider(): LlmProvider | null {
  // Test mock
  try {
    // @ts-ignore
    const testMock = (globalThis as any).Deno?.env.get('TEST_USE_MOCK_LLM');
    if (testMock === '1') {
      return {
        async generateText({ prompt }) {
          return { text: `MOCK: ${String(prompt).slice(0, 60)}` };
        }
      };
    }
  } catch {}
  const openaiKey = getEnv('OPENAI_API_KEY') || '';
  const anthropicKey = getEnv('ANTHROPIC_API_KEY') || '';
  const prefer = (getEnv('LLM_PROVIDER') || '').toLowerCase(); // 'openai' | 'anthropic'

  if (prefer === 'anthropic' && anthropicKey) {
    const model = getEnv('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307';
    return {
      async generateText({ prompt, maxTokens, temperature }) {
        return anthropicGenerate(prompt, { apiKey: anthropicKey, model, maxTokens, temperature });
      },
    };
  }
  if (openaiKey) {
    const model = getEnv('OPENAI_MODEL') || 'gpt-5';
    return {
      async generateText({ prompt, maxTokens, temperature }) {
        return openaiGenerate(prompt, { apiKey: openaiKey, model, maxTokens, temperature });
      },
    };
  }
  if (anthropicKey) {
    const model = getEnv('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307';
    return {
      async generateText({ prompt, maxTokens, temperature }) {
        return anthropicGenerate(prompt, { apiKey: anthropicKey, model, maxTokens, temperature });
      },
    };
  }
  return null;
}

export function enforceBudgetOrThrow(opts: { estimatedTokens?: number; maxTokens?: number }) {
  const maxPerCall = +(getEnv('LLM_MAX_TOKENS') || '1024');
  const est = opts.estimatedTokens ?? 0;
  const req = opts.maxTokens ?? 0;
  if (req > maxPerCall || est > maxPerCall * 2) {
    throw new Error('budget_exceeded');
  }
}


