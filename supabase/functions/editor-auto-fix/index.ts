import { withCors } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { Errors } from "../_shared/error.ts";
import { requireOptionB } from "../_shared/flags.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!AGENT_TOKEN) {
  throw new Error("AGENT_TOKEN is required");
}

Deno.serve(withCors(async (req: Request) => {
  const reqId = crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return Errors.methodNotAllowed(req.method, reqId, req) as any;

  const rl = rateLimit(req); if (rl) return rl;
  const gate = requireOptionB(reqId, req); if (gate) return gate;

  try {
    const body = await req.json() as { courseId: string; apply?: boolean; jobId?: string };
    const { courseId, apply = false, jobId } = body || {} as any;
    if (!courseId || typeof courseId !== 'string') {
      return Errors.invalidRequest("Invalid courseId", reqId, req) as any;
    }

    // 1) generate-repair
    const repRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-repair`, {
      method: 'POST',
      headers: { 'X-Agent-Token': AGENT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, jobId }),
    });
    const repJson = await repRes.json().catch(() => ({}));
    if (!repRes.ok) return Errors.internal(`generate-repair failed (${repRes.status}): ${repJson?.error || ''}`, reqId, req) as any;

    // 2) variants audit (optional: pass through report)
    const audRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-variants-audit`, {
      method: 'POST',
      headers: { 'X-Agent-Token': AGENT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, jobId }),
    });
    const audJson = await audRes.json().catch(() => ({}));
    if (!audRes.ok) return Errors.internal(`variants-audit failed (${audRes.status}): ${audJson?.error || ''}`, reqId, req) as any;

    // 3) generate missing variants
    const misRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-variants-missing`, {
      method: 'POST',
      headers: { 'X-Agent-Token': AGENT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, jobId }),
    });
    const misJson = await misRes.json().catch(() => ({}));
    if (!misRes.ok) return Errors.internal(`variants-missing failed (${misRes.status}): ${misJson?.error || ''}`, reqId, req) as any;

    // Combine patches: repair then missing (audit patch is empty by design)
    const patchRep = Array.isArray(repJson?.mergePlan?.patch) ? repJson.mergePlan.patch : [];
    const patchMis = Array.isArray(misJson?.mergePlan?.patch) ? misJson.mergePlan.patch : [];
    const combined = { patch: [...patchRep, ...patchMis] };

    // 4) apply-job-result (dryRun or persist)
    const applyRes = await fetch(`${SUPABASE_URL}/functions/v1/apply-job-result`, {
      method: 'POST',
      headers: { 'X-Agent-Token': AGENT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, courseId, mergePlan: combined, description: 'Editor Auto-Fix', dryRun: !apply }),
    });
    const applyJson = await applyRes.json().catch(() => ({}));
    if (!applyRes.ok) return Errors.internal(`apply-job-result failed (${applyRes.status}): ${applyJson?.error || ''}`, reqId, req) as any;

    return new Response(JSON.stringify({ ok: true, courseId, preview: applyJson?.preview, etag: applyJson?.etag, applied: apply === true, audit: audJson?.report }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
    });
  } catch (e: any) {
    return Errors.invalidRequest(e?.message || "Invalid JSON", reqId, req) as any;
  }
}));


