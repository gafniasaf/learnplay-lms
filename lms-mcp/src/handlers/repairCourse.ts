import { config } from '../config';
import { fetchJson } from '../http';

export interface RepairCourseInput {
  courseId: string;
  jobId?: string;
  dryRun?: boolean;
}

export async function repairCourse({ params }: { params: RepairCourseInput }) {
  const { courseId, jobId, dryRun = true } = params;

  // 1) Generate repair merge plan
  const genUrl = `${config.supabaseUrl}/functions/v1/generate-repair`;
  const genRes = await fetchJson(genUrl, {
    method: 'POST',
    headers: {
      'X-Agent-Token': config.agentToken,
      'Content-Type': 'application/json',
    },
    body: { courseId, jobId },
    timeoutMs: 15000,
  });
  if (!genRes.ok) {
    throw new Error(`generate-repair failed (${genRes.status}): ${genRes.json?.error || genRes.text}`);
  }
  const mergePlan = genRes.json?.mergePlan || { patch: [] };

  // 2) Apply (dryRun by default) to get a diff/etag
  const applyUrl = `${config.supabaseUrl}/functions/v1/apply-job-result`;
  const applyRes = await fetchJson(applyUrl, {
    method: 'POST',
    headers: {
      'X-Agent-Token': config.agentToken,
      'Content-Type': 'application/json',
    },
    body: {
      jobId,
      courseId,
      mergePlan,
      description: 'Automated repair (self-heal)',
      dryRun,
    },
    timeoutMs: 15000,
  });
  if (!applyRes.ok) {
    throw new Error(`apply-job-result failed (${applyRes.status}): ${applyRes.json?.error || applyRes.text}`);
  }
  return { ok: true, courseId, jobId, etag: applyRes.json?.etag, dryRun };
}


