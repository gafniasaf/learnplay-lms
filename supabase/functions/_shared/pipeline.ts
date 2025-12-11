// Centralized LLM pipeline helpers

type Json = any;

export interface GenerateOptions {
  templateId?: string;
  templateContent?: string;
  variables?: Record<string, string>;
  maxTokens?: number;
  temperature?: number;
}

export async function loadTemplates(includeContent = false): Promise<Array<{ id: string; kind?: string; label?: string; version?: number; prompt?: string }>> {
  try {
    // @ts-ignore
    const base = (globalThis as any).Deno?.env.get('SUPABASE_URL');
    const url = `${base}/functions/v1/list-templates${includeContent ? '?include=content' : ''}`;
    const r = await fetch(url);
    const j = await r.json();
    if (r.ok && j?.templates) return j.templates;
  } catch {}
  return [];
}

export function fillTemplate(template: string, vars: Record<string, string> = {}): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, String(v ?? ''));
  }
  return out;
}

export async function generateFromTemplate(opts: GenerateOptions): Promise<{ text: string }> {
  const { getProvider, enforceBudgetOrThrow } = await import('./llm.ts');
  let prompt = opts.templateContent || '';
  if (!prompt && opts.templateId) {
    const templates = await loadTemplates(true);
    const t = templates.find(tt => tt.id === opts.templateId);
    if (t?.prompt) prompt = t.prompt;
  }
  if (!prompt) throw new Error('template_not_found');
  const filled = fillTemplate(prompt, opts.variables || {});
  enforceBudgetOrThrow({ estimatedTokens: filled.length / 3, maxTokens: opts.maxTokens ?? 512 });
  const provider = getProvider();
  if (!provider) throw new Error('llm_provider_unavailable');
  const out = await provider.generateText({ prompt: filled, maxTokens: opts.maxTokens ?? 512, temperature: opts.temperature ?? 0.2 });
  return { text: (out.text || '').trim() };
}


