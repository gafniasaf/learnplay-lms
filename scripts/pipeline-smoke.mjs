// Pipeline smoke: health -> (optional) enqueueAndTrack -> listJobs
// Writes outputs to reports/ and artifacts/

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.MCP_BASE_URL;
if (!BASE_URL) {
  console.error('[PIPELINE] ❌ MCP_BASE_URL is REQUIRED - set env var before running');
  console.error('   Example: MCP_BASE_URL=http://127.0.0.1:4000');
  process.exit(1);
}

const TOKEN = process.env.MCP_AUTH_TOKEN;
if (!TOKEN) {
  console.error('[PIPELINE] ❌ MCP_AUTH_TOKEN is REQUIRED');
  process.exit(1);
}

const PROJECT_ID = process.env.PROJECT_ID || process.env.COURSE_ID; // Optional - can be undefined

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function call(method, params = {}) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

(async () => {
  ensureDir('reports');
  ensureDir('artifacts');

  const outputs = { steps: [] };

  // 1) Health
  const health = await call('lms.health', {});
  outputs.steps.push({ name: 'health', ok: health?.ok === true, data: health });

  // 2) Optionally enqueue a tiny job if PROJECT_ID supplied
  let tracked = null;
  if (PROJECT_ID) {
    const params = {
      jobType: 'generate_subtasks',
      projectId: PROJECT_ID,
      payload: { title: 'Pipeline smoke task' },
      pollMs: 750,
      timeoutMs: 20000
    };
    tracked = await call('lms.enqueueAndTrack', params);
    outputs.steps.push({ name: 'enqueueAndTrack', ok: true, data: tracked });
  } else {
    outputs.steps.push({ name: 'enqueueAndTrack', ok: true, skipped: true, reason: 'PROJECT_ID not set' });
  }

  // 3) listJobs
  const jobsResponse = await call('lms.listJobs', {});
  const jobList = extractJobs(jobsResponse);
  outputs.steps.push({
    name: 'listJobs',
    ok: Array.isArray(jobList),
    count: Array.isArray(jobList) ? jobList.length : 0
  });

  fs.writeFileSync(path.join('reports', 'pipeline-smoke.json'), JSON.stringify(outputs, null, 2));
  fs.writeFileSync(path.join('artifacts', 'pipeline-smoke-artifacts.json'), JSON.stringify(outputs, null, 2));

  const allOk = outputs.steps.every(s => s.ok);
  if (!allOk) {
    console.error('[PIPELINE SMOKE] FAILED', outputs);
    process.exit(1);
  }
  console.log('[PIPELINE SMOKE] OK');
})().catch((e) => {
  console.error('[PIPELINE SMOKE] FAILED:', e.message);
  process.exit(1);
});

function extractJobs(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.jobs)) return result.jobs;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.result?.jobs)) return result.result.jobs;
  return null;
}


