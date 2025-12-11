import { config } from '../config.ts';
import { fetchJson } from '../http.ts';

export async function localize({ params }: { params: { courseId: string; target_lang: string } }) {
  const { courseId, target_lang } = params;

  // 1) Call generate-localize to get merge patch
  const genUrl = `${config.supabaseUrl}/functions/v1/generate-localize`;
  const genRes = await fetchJson(genUrl, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken },
    body: { courseId, target_lang },
    timeoutMs: 20000,
  });
  if (!genRes.ok) {
    throw new Error(`generate-localize failed (${genRes.status})`);
  }
  const patch = genRes.json?.mergePlan?.patch || [];

  // 2) Apply the patch via apply-job-result (no jobId here; use synthetic id)
  const jobId = `localize-${courseId}-${Date.now()}`;
  const applyUrl = `${config.supabaseUrl}/functions/v1/apply-job-result`;
  const applyBody = {
    jobId,
    courseId,
    mergePlan: { patch, description: `Localize to ${target_lang}` },
    attachments: [],
  };
  const applyRes = await fetchJson(applyUrl, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken },
    body: applyBody,
    timeoutMs: 20000,
  });
  if (!applyRes.ok) {
    throw new Error(`apply-job-result failed (${applyRes.status})`);
  }
  return { ok: true, jobId, etag: applyRes.json?.etag, patchLength: patch.length };
}


