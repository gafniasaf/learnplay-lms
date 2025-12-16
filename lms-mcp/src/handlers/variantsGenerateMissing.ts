import { config } from '../config';
import { fetchJson } from '../http';

export async function variantsGenerateMissing({ params }: { params: { courseId: string; axes?: string[]; dryRun?: boolean; jobId?: string } }) {
  const { courseId, axes = ['difficulty'], dryRun = true, jobId } = params;
  // Call generator
  const genUrl = `${config.supabaseUrl}/functions/v1/generate-variants-missing`;
  const genRes = await fetchJson(genUrl, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: { courseId, axes, jobId },
    timeoutMs: 15000,
  });
  if (!genRes.ok) throw new Error(`variants-missing failed (${genRes.status}): ${genRes.json?.error || genRes.text}`);
  const mergePlan = genRes.json?.mergePlan || { patch: [] };

  // Apply dryRun
  const applyUrl = `${config.supabaseUrl}/functions/v1/apply-job-result`;
  const applyRes = await fetchJson(applyUrl, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: { courseId, jobId, mergePlan, description: 'Generate missing variants', dryRun },
    timeoutMs: 15000,
  });
  if (!applyRes.ok) throw new Error(`apply-job-result failed (${applyRes.status}): ${applyRes.json?.error || applyRes.text}`);

  return { ok: true, courseId, etag: applyRes.json?.etag, dryRun };
}


