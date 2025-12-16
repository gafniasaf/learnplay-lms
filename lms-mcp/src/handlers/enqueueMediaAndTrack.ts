import { enqueueMedia } from './enqueueMedia';
import { getMediaJob } from './getMediaJob';

type EnqueueMediaAndTrackParams = {
  courseId: string;
  itemId: number;
  prompt: string;
  style?: string;
  provider?: string;
  mediaType?: 'image';
  timeoutSec?: number;
  pollIntervalMs?: number;
};

export async function enqueueMediaAndTrack({ params }: { params: EnqueueMediaAndTrackParams }) {
  const timeoutMs = (params.timeoutSec ?? 120) * 1000;
  const pollIntervalMs = Math.max(200, params.pollIntervalMs ?? 1500);

  const { mediaJobId } = await enqueueMedia({ params });

  let status = 'pending';
  let result_url: string | undefined;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await getMediaJob({ params: { id: mediaJobId } as any });
    status = (job as any)?.status || status;
    result_url = (job as any)?.result_url || result_url;
    if (status === 'done' || status === 'failed') break;
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  return { ok: true, mediaJobId, status, result_url };
}


