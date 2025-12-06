/**
 * API Client: updateCourse
 * Sends JSON Patch operations to update-course Edge Function
 */

import { supabase } from '@/integrations/supabase/client';

export interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string;
}

export interface UpdateCourseRequest {
  courseId: string;
  ops: PatchOperation[];
  expectedEtag?: string;
}

export interface UpdateCourseResponse {
  course: any;
  contentVersion: number;
  etag: string;
  opsApplied: number;
}

/**
 * Update a course with JSON Patch operations
 */
export async function updateCourse(
  request: UpdateCourseRequest
): Promise<UpdateCourseResponse> {
  const { data, error } = await supabase.functions.invoke('update-course', {
    body: request,
  });

  if (error) {
    throw new Error(`Failed to update course: ${error.message}`);
  }

  if (!data) {
    throw new Error('Empty response from update-course');
  }

  return data as UpdateCourseResponse;
}

