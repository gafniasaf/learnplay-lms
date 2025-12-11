/**
 * AI Provider Configuration and Selection
 * Manages provider fallback order and telemetry
 */

export type AIProvider = 'openai' | 'anthropic';

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  available: boolean;
}

export interface ProviderTelemetry {
  provider: AIProvider;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  tokensUsed?: number;
  estimatedCost?: number;
}

/**
 * Get ordered list of available providers based on env configuration
 * Priority: OPENAI_PROVIDER_PRIORITY env var > OpenAI > Anthropic
 */
export function getAvailableProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  const priority = (Deno.env.get("AI_PROVIDER_PRIORITY") || "openai,anthropic").toLowerCase();
  
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const anthropicModel = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20241022";
  
  // Build provider list in priority order
  const providerMap: Record<string, ProviderConfig | null> = {
    openai: openaiKey ? {
      provider: 'openai',
      apiKey: openaiKey,
      model: 'gpt-4-turbo-2024-04-09',
      available: true,
    } : null,
    anthropic: anthropicKey ? {
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: anthropicModel,
      available: true,
    } : null,
  };
  
  // Order by priority setting
  priority.split(',').forEach((p) => {
    const config = providerMap[p.trim()];
    if (config) {
      providers.push(config);
    }
  });
  
  return providers;
}

/**
 * Calculate estimated cost for API call
 * Rough estimates based on current pricing (2025)
 */
export function estimateCost(provider: AIProvider, tokensUsed: number): number {
  const pricing: Record<AIProvider, { input: number; output: number }> = {
    openai: { input: 10 / 1_000_000, output: 30 / 1_000_000 }, // GPT-4 Turbo: $10/1M input, $30/1M output
    anthropic: { input: 3 / 1_000_000, output: 15 / 1_000_000 }, // Claude 3.5 Sonnet: $3/1M input, $15/1M output
  };
  
  const rates = pricing[provider];
  // Assume 50/50 split between input and output for simplicity
  const avgRate = (rates.input + rates.output) / 2;
  return tokensUsed * avgRate;
}

/**
 * Record provider telemetry to database for observability
 */
export async function recordProviderTelemetry(
  supabase: any,
  telemetry: ProviderTelemetry,
  jobId?: string,
  ctx?: any
): Promise<void> {
  try {
    await supabase.from('ai_provider_telemetry').insert({
      job_id: jobId,
      provider: telemetry.provider,
      latency_ms: telemetry.latencyMs,
      success: telemetry.success,
      error_type: telemetry.errorType,
      tokens_used: telemetry.tokensUsed,
      estimated_cost: telemetry.estimatedCost,
      recorded_at: new Date().toISOString(),
    });
  } catch (err) {
    // Don't fail job if telemetry insert fails
    console.warn('[ai-providers] Failed to record telemetry:', err);
  }
}

/**
 * Redact PII from prompts before logging
 */
export function redactPII(text: string): string {
  // Redact email addresses
  let redacted = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  
  // Redact phone numbers (various formats)
  redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  redacted = redacted.replace(/\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  
  // Redact credit card patterns (basic)
  redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
  
  // Redact SSN patterns
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  
  return redacted;
}


