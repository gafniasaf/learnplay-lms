/**
 * Client-side wrapper for restore-course-version Edge Function
 */

import { supabase } from '@/integrations/supabase/client';

export interface RestoreCourseResponse {
  newVersion: number;
  restoredFromVersion: number;
  snapshotId: string;
  etag: number;
  publishedAt: string;
}

export async function restoreCourseVersion(
  courseId: string,
  version: number,
  changelog?: string
): Promise<RestoreCourseResponse> {
  const { data, error } = await supabase.functions.invoke('restore-course-version', {
    method: 'POST',
    body: { courseId, version, changelog },
  });

  if (error) {
    throw new Error(`Failed to restore course: ${error.message}`);
  }

  return data as RestoreCourseResponse;
}

