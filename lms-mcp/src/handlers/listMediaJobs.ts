import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

type ListMediaJobsParams = {
  courseId?: string;
  status?: 'pending' | 'processing' | 'done' | 'failed';
  limit?: number;
};

export async function listMediaJobs({ params }: { params: ListMediaJobsParams }) {
  if (!config.serviceRoleKey) {
    throw new Error('Service role key required for listMediaJobs');
  }
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey);
  let q = supabase.from('ai_media_jobs').select('*');
  if (params.courseId) q = (q as any).eq('course_id', params.courseId);
  if (params.status) q = (q as any).eq('status', params.status);
  q = (q as any).order('created_at', { ascending: false }).limit(Math.max(1, Math.min(params.limit ?? 20, 100)));
  const { data, error } = await (q as any);
  if (error) throw new Error(error.message);
  return data ?? [];
}


