/**
 * API Client: searchMedia
 * Semantic search over media_assets using pgvector
 */

import { supabase } from '@/integrations/supabase/client';

export interface SearchMediaFilters {
  mimeType?: string;
  uploadedBy?: string;
  tags?: string[];
  bucket?: string;
}

export interface SearchMediaRequest {
  query: string;
  filters?: SearchMediaFilters;
  limit?: number;
  offset?: number;
}

export interface MediaAsset {
  id: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  alt?: string;
  tags: string[];
  similarity: number;
  sizeBytes?: number;
}

export interface SearchMediaResponse {
  results: MediaAsset[];
  total: number;
  limit: number;
  offset: number;
  query: string;
}

/**
 * Search media library using semantic search
 */
export async function searchMedia(
  request: SearchMediaRequest
): Promise<SearchMediaResponse> {
  const { data, error } = await supabase.functions.invoke('search-media', {
    body: request,
  });

  if (error) {
    throw new Error(`Failed to search media: ${error.message}`);
  }

  if (!data) {
    throw new Error('Empty response from search-media');
  }

  return data as SearchMediaResponse;
}

