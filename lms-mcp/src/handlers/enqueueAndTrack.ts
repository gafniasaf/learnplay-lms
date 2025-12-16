import { config } from '../config';
import { fetchJson } from '../http';
import { logs as logsHandler } from './logs';

interface EnqueueAndTrackParams {
  type?: string;
  subject?: string;
  courseId?: string;
  locale?: string;
  payload?: any;
  timeoutSec?: number;
  pollIntervalMs?: number;
  eventsLimit?: number;
}

const TERMINAL = new Set(['done', 'failed', 'aborted', 'cancelled', 'canceled']);

export async function enqueueAndTrack({ params }: { params: EnqueueAndTrackParams }) {
  const startedAt = Date.now();
  const timeoutMs = (params.timeoutSec ?? 120) * 1000;
  const pollIntervalMs = Math.max(500, params.pollIntervalMs ?? 1500);

  // Normalize job type for generic enqueue function; fall back to legacy if unknown
  const normalizeJobType = (t?: string): string | undefined => {
    if (!t) return undefined;
    const s = String(t).toLowerCase();
    if (s === 'course' || s === 'course_generation') return 'course_generation';
    const allowed = new Set([
      'variants','remediation','localize','hint','assignment','image','marketing','curriculum',
    ]);
    return allowed.has(s) ? s : undefined;
  };
  const jobType = normalizeJobType(params.type);

  // 1) Enqueue
  const eq = await fetchJson<{ jobId: string }>(`${config.supabaseUrl}/functions/v1/enqueue-job`, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken },
    body: {
      // Prefer generic path when possible; server falls back to legacy if jobType is undefined
      jobType,
      subject: params.subject,
      courseId: params.courseId,
      locale: params.locale,
      payload: params.payload,
    },
  });
  if (!eq.ok || !eq.json?.jobId) {
    throw new Error(`enqueueAndTrack: enqueue failed (${eq.status}) ${eq.text || ''}`);
  }
  const jobId = eq.json.jobId;

  // 2) Poll get-job
  let status = 'unknown';
  let courseId: string | undefined;
  let lastRequestId = eq.requestId;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs);
    const gj = await fetchJson<any>(`${config.supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { 'X-Agent-Token': config.agentToken },
    });
    lastRequestId = gj.requestId || lastRequestId;
    if (!gj.ok || !gj.json) {
      continue;
    }
    const job = gj.json.job || gj.json;
    status = String(job.status || 'unknown').toLowerCase();
    courseId = job.course_id || job.courseId || courseId;
    if (TERMINAL.has(status)) break;
  }

  // 3) Fetch logs
  const events = await logsHandler({ params: { jobId } as any });

  return { ok: true, jobId, status, courseId, events, lastRequestId };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }


