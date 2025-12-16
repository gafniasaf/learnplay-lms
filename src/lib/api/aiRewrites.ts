/**
 * API Client: AI Rewrites and Generations
 * Wrappers for text rewriting, media generation, and exercise generation
 */

import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// TEXT REWRITING
// ============================================================================

export interface RewriteTextRequest {
  segmentType: 'stem' | 'option' | 'reference';
  currentText: string;
  // Rich context object; allow arbitrary fields so we can pass item-level info
  context: Record<string, any>;
  styleHints?: Array<'simplify' | 'add_visual_cue' | 'more_formal' | 'more_casual' | 'add_context'>;
  candidateCount?: number;
}

export interface TextCandidate {
  text: string;
  rationale: string;
}

export interface RewriteTextResponse {
  candidates: TextCandidate[];
  originalText: string;
  segmentType: string;
  context: any;
}

function fnName(base: string) {
  try {
    const debug = typeof window !== 'undefined' && (localStorage.getItem('ai.debug') === '1' || /aiDebug=1/.test(window.location.search));
    return debug ? `${base}?debug=1` : base;
  } catch {
    return base;
  }
}

function sanitize(text: string) {
  return String(text).replace(/\s+/g, ' ').replace(/\[blank\]/gi, '[blank]').trim();
}

function fallbackRewrite(req: RewriteTextRequest, reason: string): RewriteTextResponse {
  return {
    candidates: [{ text: sanitize(req.currentText), rationale: `Fallback used: ${reason}` }],
    originalText: req.currentText,
    segmentType: req.segmentType,
    context: req.context,
  };
}

export async function rewriteText(
  request: RewriteTextRequest
): Promise<RewriteTextResponse> {
  // Try primary function first; if it fails, try v2 (self-contained deploy)
  const tryInvoke = async (slug: string) => {
    const { data, error } = await supabase.functions.invoke(fnName(slug), {
      body: request,
    });
    if (error) throw Object.assign(new Error(error.message), { status: (error as any)?.context?.response?.status || (error as any)?.status });
    if (!data) throw new Error('empty response');
    return data as RewriteTextResponse;
  };

  try {
    return await tryInvoke('ai-rewrite-text');
  } catch (e1: any) {
    console.warn('[aiRewrites] primary failed; using local fallback:', e1?.status || '', e1?.message);
    return fallbackRewrite(request, e1?.message || 'invoke error');
  }
}

// ============================================================================
// MEDIA GENERATION
// ============================================================================

export interface GenerateMediaRequest {
  prompt: string;
  kind: 'image' | 'audio';
  providerId?: string;
  options?: {
    size?: string;
    quality?: string;
    voice?: string;
    aspectRatio?: string;
    style?: string;
  };
}

export interface GeneratedMedia {
  id: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  alt?: string;
  provider: string;
  tempPath: string;
  metadata: any;
}

export async function generateMedia(
  request: GenerateMediaRequest
): Promise<GeneratedMedia> {
  const slug = fnName('ai-generate-media');
  const { data, error } = await supabase.functions.invoke(slug, {
    body: request,
  });

  if (error) {
    const status = (error as any)?.context?.response?.status ?? (error as any)?.status;
    // Extract detailed error message from the response
    const errorDetail = (error as any)?.context?.body?.error?.message || error.message;
    const maybeNotDeployed =
      status === 404 ||
      /Failed to send a request to the Edge Function/i.test(String(errorDetail)) ||
      /404/i.test(String(errorDetail));

    const hint = maybeNotDeployed
      ? ' (Edge Function ai-generate-media may not be deployed to this Supabase project)'
      : '';

    throw new Error(`Failed to generate media${status ? ` (${status})` : ''}: ${errorDetail}${hint}`);
  }

  if (!data) {
    throw new Error('Empty response from ai-generate-media');
  }

  // Some Edge Functions return 200 with ok:false (preview stability). Treat as a hard failure.
  if (data && typeof data === 'object' && 'ok' in (data as any) && (data as any).ok === false) {
    const err = (data as any).error;
    const code = typeof err?.code === 'string' ? err.code : 'ai_generate_media_failed';
    const message = typeof err?.message === 'string' ? err.message : 'AI media generation failed';
    const requestId = typeof (data as any)?.requestId === 'string' ? (data as any).requestId : undefined;
    const retryable = (err as any)?.retryable === true;
    const suffix = `${retryable ? ' Please try again.' : ''}${requestId ? ` (requestId: ${requestId})` : ''}`;
    throw new Error(`${message}${suffix}`);
  }

  return data as GeneratedMedia;
}

// ============================================================================
// EXERCISE GENERATION
// ============================================================================

export interface GenerateExercisesRequest {
  courseId: string;
  count: number;
  modes?: Array<'options' | 'numeric'>;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  topics?: string[];
}

export interface GeneratedItem {
  _aiGenerated: boolean;
  mode: 'options' | 'numeric';
  stem: {
    text: string;
  };
  options?: string[];
  answer: number | string;
  difficulty: string;
  clusterId?: string;
}

export interface GenerateExercisesResponse {
  items: GeneratedItem[];
  count: number;
  courseId: string;
  metadata: {
    difficulty: string;
    modes: string[];
    topics: string[];
  };
}

export async function generateExercises(
  request: GenerateExercisesRequest
): Promise<GenerateExercisesResponse> {
  const { data, error } = await supabase.functions.invoke('ai-generate-exercises', {
    body: request,
  });

  if (error) {
    throw new Error(`Failed to generate exercises: ${error.message}`);
  }

  if (!data) {
    throw new Error('Empty response from ai-generate-exercises');
  }

  return data as GenerateExercisesResponse;
}

