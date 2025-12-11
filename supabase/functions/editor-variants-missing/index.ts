import { withCors } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { Errors } from "../_shared/error.ts";

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

  try {
    const body = await req.json() as { courseId: string; apply?: boolean; axes?: string[]; jobId?: string };
    const { courseId, apply = false, axes = ['difficulty'], jobId } = body || {} as any;
    if (!courseId || typeof courseId !== 'string') {
      return Errors.invalidRequest("Invalid courseId", reqId, req) as any;
    }

    // 1) generate-variants-missing
    const genRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-variants-missing`, {
      method: 'POST',
      headers: { 'X-Agent-Token': AGENT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, axes, jobId }),
    });
    const genJson = await genRes.json().catch(() => ({}));
    if (!genRes.ok) return Errors.internal(`variants-missing failed (${genRes.status}): ${genJson?.error || ''}`, reqId, req) as any;
    const mergePlan = genJson?.mergePlan || { patch: [] };

    // 2) apply-job-result (dryRun or persist)
    const applyRes = await fetch(`${SUPABASE_URL}/functions/v1/apply-job-result`, {
      method: 'POST',
      headers: { 'X-Agent-Token': AGENT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, courseId, mergePlan, description: 'Editor Variants Generate Missing', dryRun: !apply }),
    });
    const applyJson = await applyRes.json().catch(() => ({}));
    if (!applyRes.ok) return Errors.internal(`apply-job-result failed (${applyRes.status}): ${applyJson?.error || ''}`, reqId, req) as any;

    return new Response(JSON.stringify({ ok: true, courseId, preview: applyJson?.preview, etag: applyJson?.etag, applied: apply === true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
    });
  } catch (e: any) {
    return Errors.invalidRequest(e?.message || "Invalid JSON", reqId, req) as any;
  }
}));


