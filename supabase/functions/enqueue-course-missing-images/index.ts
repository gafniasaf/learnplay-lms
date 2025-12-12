import { withCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!AGENT_TOKEN) {
  throw new Error("AGENT_TOKEN is required");
}

type Json = any;

function itemHasImage(course: any, item: any): boolean {
  try {
    const key = `item:${item?.id}:stem`;
    const images = course?.images?.[key];
    if (Array.isArray(images) && images.length > 0) return true;
    // Support both modern schema (stimulus: {type:'image', url}) and legacy arrays
    if (item?.stimulus?.type === 'image' && item?.stimulus?.url) return true;
    const media = item?.stem?.media || item?.stimulus?.media || [];
    return Array.isArray(media) && media.some((m: any) => (m?.type || '').startsWith('image'));
  } catch {
    return false;
  }
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  const token = req.headers.get("X-Agent-Token") || "";
  const expected = Deno.env.get("AGENT_TOKEN") || "";
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  try {
    const body = await req.json();
    const courseId = String(body?.courseId || '');
    const dryRun = !!body?.dryRun;
    const limit = Math.min(+(body?.limit ?? 25), 200);
    const promptTemplate = String(body?.promptTemplate || 'Generate an illustrative image for: {{stem}}');
    if (!courseId) {
      return new Response(JSON.stringify({ error: "invalid_courseId" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const baseUrl = SUPABASE_URL;
    const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const publicUrl = `${baseUrl}/storage/v1/object/public/courses/${courseId}/course.json`;
    const privateUrl = `${baseUrl}/storage/v1/object/courses/${courseId}/course.json`;
    let course: Json = null;
    try {
      const resp = await fetch(sr ? privateUrl : publicUrl, { headers: sr ? { Authorization: `Bearer ${sr}` } : undefined });
      if (resp.ok) course = await resp.json();
    } catch {}
    const items: any[] = Array.isArray(course?.items) ? course.items : [];
    const missing: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      if (!itemHasImage(course, it)) missing.push(it?.id ?? i);
    }
    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, missing, count: missing.length }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const enqueueUrl = `${baseUrl}/functions/v1/enqueue-course-media`;
    const jobIds: string[] = [];
    let enqueued = 0;
    for (const itemId of missing) {
      if (enqueued >= limit) break;
      const item = items.find((it) => (it?.id ?? -1) === itemId);
      const stemText = item?.stem?.text || item?.text || `Item ${itemId}`;
      const prompt = promptTemplate.replace('{{stem}}', String(stemText));
      const r = await fetch(enqueueUrl, {
        method: 'POST',
        headers: { 'X-Agent-Token': expected, 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, itemId, prompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j?.jobId || j?.mediaJobId || j?.id)) {
        jobIds.push(j.jobId || j.mediaJobId || j.id);
        enqueued++;
      }
    }

    return new Response(JSON.stringify({ ok: true, jobIds, count: enqueued, missingTotal: missing.length }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
}));


