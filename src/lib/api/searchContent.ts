/**
 * API Client: searchContent
 * Semantic search over course content (stems, options, reference text)
 */

import { supabase } from '@/integrations/supabase/client';

export interface SearchContentScope {
  courseId?: string;
  contentTypes?: Array<'stem' | 'option' | 'reference'>;
}

export interface SearchContentRequest {
  query: string;
  scope?: SearchContentScope;
  limit?: number;
  offset?: number;
}

export interface ContentResult {
  courseId: string;
  groupIndex: number;
  itemIndex: number;
  contentType: 'stem' | 'option' | 'reference';
  optionId?: string;
  text: string;
  similarity: number;
}

export interface SearchContentResponse {
  results: ContentResult[];
  total: number;
  limit: number;
  offset: number;
  query: string;
  scope: SearchContentScope;
}

/**
 * Search course content using semantic search
 */
export async function searchContent(
  request: SearchContentRequest
): Promise<SearchContentResponse> {
  const { data, error } = await supabase.functions.invoke('search-content', {
    body: request,
  });

  if (error) {
    throw new Error(`Failed to search content: ${error.message}`);
  }

  if (!data) {
    throw new Error('Empty response from search-content');
  }

  return data as SearchContentResponse;
}

