/**
 * Media Generation Provider Registry
 * 
 * Extensible plugin architecture for AI media generation providers.
 * Supports DALL-E 3, Stable Diffusion, OpenAI TTS, ElevenLabs, video generators, etc.
 */

export interface GenerateParams {
  mediaType: 'image' | 'audio' | 'video';
  prompt: string;
  style?: string;
  seed?: string;
  targetRef?: {
    type: 'study_text' | 'item_stimulus' | 'item_option';
    courseId: string;
    itemId?: number;
    sectionId?: string;
    optionIndex?: number;
  };
  options?: Record<string, unknown>;
}

export interface MediaResult {
  url: string;
  publicUrl?: string;
  metadata: {
    provider: string;
    model: string;
    revised_prompt?: string;
    dimensions?: { width: number; height: number };
    duration?: number;
    file_size?: number;
    mime_type?: string;
    moderation_flags?: Record<string, unknown>;
    generation_time_ms?: number;
    cost_usd?: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface MediaProvider {
  id: string;
  name: string;
  mediaTypes: ('image' | 'audio' | 'video')[];
  enabled: boolean;
  
  // Core functionality
  generate(params: GenerateParams): Promise<MediaResult>;
  estimateCost(params: GenerateParams): number;
  validateParams(params: GenerateParams): ValidationResult;
  
  // Metadata
  avgGenerationTime: number;  // seconds
  qualityRating: number;  // 1-5
  config: Record<string, unknown>;
}

export class UpstreamProviderError extends Error {
  public readonly providerId: string;
  public readonly status: number;
  public readonly retryable: boolean;

  constructor(args: { providerId: string; status: number; retryable: boolean; message: string }) {
    super(args.message);
    this.name = "UpstreamProviderError";
    this.providerId = args.providerId;
    this.status = args.status;
    this.retryable = args.retryable;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function parseOpenAIErrorMessage(res: Response): Promise<{ message: string; code?: string }> {
  const text = await res.text().catch(() => "");
  if (!text) return { message: res.statusText || "Upstream error" };
  try {
    const json = JSON.parse(text) as any;
    const msg = json?.error?.message || json?.message || text;
    const code = json?.error?.code || json?.error?.type || json?.code;
    return { message: String(msg), code: code ? String(code) : undefined };
  } catch {
    return { message: text || res.statusText || "Upstream error" };
  }
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

/**
 * OpenAI DALL-E 3 Provider
 */
export const dalleProvider: MediaProvider = {
  id: 'openai-dalle3',
  name: 'DALL-E 3',
  mediaTypes: ['image'],
  enabled: true,
  avgGenerationTime: 45,
  qualityRating: 5,
  config: {
    model: 'dall-e-3',
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    quality: 'standard',
  },
  
  estimateCost: () => 0.04,
  
  validateParams(params: GenerateParams): ValidationResult {
    if (!params.prompt || params.prompt.length < 10) {
      return { valid: false, error: 'Prompt must be at least 10 characters' };
    }
    if (params.prompt.length > 4000) {
      return { valid: false, error: 'Prompt exceeds 4000 character limit' };
    }
    return { valid: true };
  },
  
  async generate(params: GenerateParams): Promise<MediaResult> {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    
    const startTime = Date.now();
    
    const size = params.options?.size as string || '1024x1024';
    const quality = params.options?.quality as string || 'standard';

    const maxAttempts = 3;
    let lastErr: UpstreamProviderError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: params.prompt,
            n: 1,
            size,
            quality,
            response_format: 'url',
          }),
        });
        
        if (!response.ok) {
          const parsed = await parseOpenAIErrorMessage(response);
          const retryable = isRetryableStatus(response.status);
          const msg = `DALL-E 3 generation failed: ${parsed.message}${parsed.code ? ` (code: ${parsed.code})` : ''}`;
          lastErr = new UpstreamProviderError({
            providerId: 'openai-dalle3',
            status: response.status,
            retryable,
            message: msg,
          });

          if (retryable && attempt < maxAttempts) {
            const backoffMs = 750 * attempt * attempt;
            await sleep(backoffMs);
            continue;
          }
          throw lastErr;
        }
        
        const data = await response.json();
        const generationTime = Date.now() - startTime;
        
        return {
          url: data.data[0].url,
          metadata: {
            provider: 'openai-dalle3',
            model: 'dall-e-3',
            revised_prompt: data.data[0].revised_prompt,
            dimensions: size === '1024x1024' ? { width: 1024, height: 1024 } 
                      : size === '1792x1024' ? { width: 1792, height: 1024 }
                      : { width: 1024, height: 1792 },
            mime_type: 'image/png',
            generation_time_ms: generationTime,
            cost_usd: quality === 'hd' ? 0.08 : 0.04,
          },
        };
      } catch (e) {
        if (e instanceof UpstreamProviderError) {
          lastErr = e;
          if (e.retryable && attempt < maxAttempts) {
            const backoffMs = 750 * attempt * attempt;
            await sleep(backoffMs);
            continue;
          }
          throw e;
        }

        const msg = e instanceof Error ? e.message : String(e);
        lastErr = new UpstreamProviderError({
          providerId: 'openai-dalle3',
          status: 0,
          retryable: true,
          message: `DALL-E 3 generation failed: ${msg}`,
        });
        if (attempt < maxAttempts) {
          const backoffMs = 750 * attempt * attempt;
          await sleep(backoffMs);
          continue;
        }
        throw lastErr;
      }
    }

    throw lastErr ?? new UpstreamProviderError({
      providerId: 'openai-dalle3',
      status: 0,
      retryable: true,
      message: 'DALL-E 3 generation failed: Unknown error',
    });
  },
};

/**
 * OpenAI DALL-E 3 HD Provider
 */
export const dalleHDProvider: MediaProvider = {
  ...dalleProvider,
  id: 'openai-dalle3-hd',
  name: 'DALL-E 3 HD',
  config: {
    model: 'dall-e-3',
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    quality: 'hd',
  },
  estimateCost: () => 0.08,
  avgGenerationTime: 50,
  
  async generate(params: GenerateParams): Promise<MediaResult> {
    const result = await dalleProvider.generate({
      ...params,
      options: { ...params.options, quality: 'hd' },
    });
    result.metadata.provider = 'openai-dalle3-hd';
    return result;
  },
};

/**
 * OpenAI TTS Provider
 */
export const openaiTTSProvider: MediaProvider = {
  id: 'openai-tts',
  name: 'OpenAI TTS',
  mediaTypes: ['audio'],
  enabled: true,
  avgGenerationTime: 20,
  qualityRating: 5,
  config: {
    model: 'tts-1',
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  },
  
  estimateCost: (params) => {
    const charCount = params.prompt.length;
    return (charCount / 1000) * 0.015;
  },
  
  validateParams(params: GenerateParams): ValidationResult {
    if (!params.prompt || params.prompt.length === 0) {
      return { valid: false, error: 'Text is required' };
    }
    if (params.prompt.length > 4096) {
      return { valid: false, error: 'Text exceeds 4096 character limit' };
    }
    return { valid: true };
  },
  
  async generate(params: GenerateParams): Promise<MediaResult> {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    
    const startTime = Date.now();
    const voice = params.options?.voice as string || 'alloy';
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice,
        input: params.prompt,
        response_format: 'mp3',
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI TTS failed: ${error}`);
    }
    
    const audioBlob = await response.blob();
    const generationTime = Date.now() - startTime;
    
    // Return blob URL for now; caller will upload to Supabase Storage
    return {
      url: URL.createObjectURL(audioBlob),
      metadata: {
        provider: 'openai-tts',
        model: 'tts-1',
        mime_type: 'audio/mpeg',
        file_size: audioBlob.size,
        generation_time_ms: generationTime,
        cost_usd: (params.prompt.length / 1000) * 0.015,
      },
    };
  },
};

/**
 * Stable Diffusion XL Provider (via Replicate)
 */
export const stableDiffusionProvider: MediaProvider = {
  id: 'replicate-sdxl',
  name: 'Stable Diffusion XL',
  mediaTypes: ['image'],
  enabled: false,  // Enable when REPLICATE_API_TOKEN is configured
  avgGenerationTime: 15,
  qualityRating: 4,
  config: {
    model: 'stability-ai/sdxl:latest',
    steps: 30,
    guidance_scale: 7.5,
  },
  
  estimateCost: () => 0.01,
  
  validateParams(params: GenerateParams): ValidationResult {
    if (!params.prompt || params.prompt.length < 5) {
      return { valid: false, error: 'Prompt must be at least 5 characters' };
    }
    return { valid: true };
  },
  
  async generate(params: GenerateParams): Promise<MediaResult> {
    const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');
    if (!REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN not configured');
    }
    
    const startTime = Date.now();
    
    // Create prediction
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'stability-ai/sdxl:latest',
        input: {
          prompt: params.prompt,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          width: 1024,
          height: 1024,
        },
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Replicate SDXL failed: ${error.detail || response.statusText}`);
    }
    
    const prediction = await response.json();
    
    // Poll for completion
    let result = prediction;
    while (result.status === 'starting' || result.status === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        },
      });
      
      result = await pollResponse.json();
    }
    
    if (result.status === 'failed') {
      throw new Error(`SDXL generation failed: ${result.error}`);
    }
    
    const generationTime = Date.now() - startTime;
    
    return {
      url: result.output[0],
      metadata: {
        provider: 'replicate-sdxl',
        model: 'stability-ai/sdxl',
        dimensions: { width: 1024, height: 1024 },
        mime_type: 'image/png',
        generation_time_ms: generationTime,
        cost_usd: 0.01,
      },
    };
  },
};

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

const providers: Record<string, MediaProvider> = {
  'openai-dalle3': dalleProvider,
  'openai-dalle3-hd': dalleHDProvider,
  'openai-tts': openaiTTSProvider,
  'replicate-sdxl': stableDiffusionProvider,
};

/**
 * Get provider by ID
 */
export function getProvider(id: string): MediaProvider | null {
  return providers[id] || null;
}

/**
 * Get all enabled providers for a media type
 */
export function getProvidersForMediaType(mediaType: 'image' | 'audio' | 'video'): MediaProvider[] {
  return Object.values(providers)
    .filter(p => p.enabled && p.mediaTypes.includes(mediaType))
    .sort((a, b) => b.qualityRating - a.qualityRating);
}

/**
 * Get default provider for a media type
 */
export function getDefaultProvider(mediaType: 'image' | 'audio' | 'video'): MediaProvider | null {
  const available = getProvidersForMediaType(mediaType);
  return available[0] || null;
}

/**
 * Compare providers for a given use case
 */
export interface ProviderComparison {
  provider: MediaProvider;
  cost: number;
  time: number;
  quality: number;
  reasoning: string;
}

export function compareProviders(
  mediaType: 'image' | 'audio' | 'video',
  params: GenerateParams,
  preference: 'fast' | 'balanced' | 'best' = 'balanced'
): ProviderComparison[] {
  const available = getProvidersForMediaType(mediaType);
  
  return available.map(provider => {
    const cost = provider.estimateCost(params);
    const time = provider.avgGenerationTime;
    const quality = provider.qualityRating;
    
    let reasoning = '';
    if (preference === 'fast') {
      reasoning = time < 20 ? 'Fastest option' : 'Slower generation time';
    } else if (preference === 'best') {
      reasoning = quality >= 5 ? 'Highest quality' : 'Lower quality';
    } else {
      const score = (quality / 5) * 0.6 + (1 - cost / 0.1) * 0.2 + (1 - time / 60) * 0.2;
      reasoning = score > 0.7 ? 'Good balance of quality, cost, and speed' : 'Lower overall value';
    }
    
    return {
      provider,
      cost,
      time,
      quality,
      reasoning,
    };
  }).sort((a, b) => {
    if (preference === 'fast') return a.time - b.time;
    if (preference === 'best') return b.quality - a.quality;
    // Balanced: weighted score
    const scoreA = (a.quality / 5) * 0.6 + (1 - a.cost / 0.1) * 0.2 + (1 - a.time / 60) * 0.2;
    const scoreB = (b.quality / 5) * 0.6 + (1 - b.cost / 0.1) * 0.2 + (1 - b.time / 60) * 0.2;
    return scoreB - scoreA;
  });
}

/**
 * Register a new provider (for extensibility)
 */
export function registerProvider(provider: MediaProvider): void {
  providers[provider.id] = provider;
}

/**
 * Telemetry helper
 */
export function logProviderUsage(
  providerId: string,
  success: boolean,
  generationTimeMs: number,
  cost: number
): void {
  console.log(JSON.stringify({
    type: 'provider_usage',
    provider: providerId,
    success,
    generation_time_ms: generationTimeMs,
    cost_usd: cost,
    timestamp: new Date().toISOString(),
  }));
}


