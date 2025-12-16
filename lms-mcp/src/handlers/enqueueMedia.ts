import { config } from '../config';
import { fetchJson } from '../http';

type EnqueueMediaParams = {
  courseId: string;
  itemId: number;
  prompt: string;
  style?: string;
  provider?: string;
  mediaType?: 'image';
};

export async function enqueueMedia({ params }: { params: EnqueueMediaParams }) {
  const res = await fetchJson<{ mediaJobId: string }>(`${config.supabaseUrl}/functions/v1/enqueue-course-media`, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken },
    body: {
      courseId: params.courseId,
      itemId: params.itemId,
      prompt: params.prompt,
      style: params.style,
      provider: params.provider || 'openai',
      mediaType: params.mediaType || 'image',
    },
  });
  if (!res.ok || !res.json?.mediaJobId) {
    throw new Error(`enqueueMedia failed (${res.status}) ${res.text || ''}`);
  }
  return { mediaJobId: res.json.mediaJobId };
}


