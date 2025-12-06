/**
 * Client-side wrapper for publish-course Edge Function
 */

import { supabase } from '@/integrations/supabase/client';

export interface PublishCourseResponse {
  version: number;
  snapshotId: string;
  contentVersion: number;
  etag: number;
  publishedAt: string;
}

export async function publishCourse(
  courseId: string,
  changelog?: string
): Promise<PublishCourseResponse> {
  // Try MCP proxy first for metrics/guardrails, fallback to direct Edge
  try {
    const { data, error } = await supabase.functions.invoke('mcp-metrics-proxy', {
      body: { method: 'lms.publishCourse', params: { courseId, changelog } },
    });
    if (!error && data?.ok !== false) {
      const payload = (data?.data || data) as any;
      return {
        version: Number(payload?.version ?? payload?.data?.version ?? 0),
        snapshotId: String(payload?.snapshotId ?? payload?.data?.snapshotId ?? ''),
        contentVersion: Number(payload?.contentVersion ?? payload?.data?.contentVersion ?? 0),
        etag: Number(payload?.etag ?? payload?.data?.etag ?? 0),
        publishedAt: String(payload?.publishedAt ?? payload?.data?.publishedAt ?? new Date().toISOString()),
      };
    }
    throw new Error(error?.message || 'proxy_failed');
  } catch {
    const { data, error } = await supabase.functions.invoke('publish-course', {
      method: 'POST',
      body: { courseId, changelog },
    });
    if (error) {
      throw new Error(`Failed to publish course: ${error.message}`);
    }
    return data as PublishCourseResponse;
  }
}

