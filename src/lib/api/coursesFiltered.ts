/**
 * Client-side wrapper for list-courses-filtered Edge Function
 */

import { supabase } from '@/integrations/supabase/client';

export interface CourseMetadata {
  id: string;
  organization_id: string;
  visibility: 'org' | 'global';
  tag_ids: string[];
  tags: Record<string, string[]>;
  content_version: number;
  etag: number;
  created_at: string;
  updated_at: string;
}

export interface CoursesFilteredResponse {
  courses: CourseMetadata[];
  total: number;
  limit: number;
  offset: number;
}

export interface CoursesFilterOptions {
  organizationId?: string;
  visibility?: 'org' | 'global';
  tagIds?: string[];
  matchAll?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getCoursesByTags(
  options: CoursesFilterOptions = {}
): Promise<CoursesFilteredResponse> {
  const params = new URLSearchParams();

  if (options.organizationId) {
    params.append('organizationId', options.organizationId);
  }
  if (options.visibility) {
    params.append('visibility', options.visibility);
  }
  if (options.tagIds && (options.tagIds?.length ?? 0) > 0) {
    params.append('tagIds', options.tagIds.join(','));
  }
  if (options.matchAll !== undefined) {
    params.append('matchAll', options.matchAll.toString());
  }
  if (options.search) {
    params.append('search', options.search);
  }
  if (options.limit) {
    params.append('limit', options.limit.toString());
  }
  if (options.offset) {
    params.append('offset', options.offset.toString());
  }

  const url = params.toString() ? `?${params.toString()}` : '';

  const { data, error } = await supabase.functions.invoke(
    `list-courses-filtered${url}`,
    {
      method: 'GET',
    }
  );

  if (error) {
    throw new Error(`Failed to fetch courses: ${error.message}`);
  }

  return data as CoursesFilteredResponse;
}

