import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

type GetMediaJobParams = {
  id: string;
};

export async function getMediaJob({ params }: { params: GetMediaJobParams }) {
  if (!config.serviceRoleKey) {
    throw new Error('Service role key required for getMediaJob');
  }
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey);
  const { data, error } = await supabase
    .from('ai_media_jobs')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}


