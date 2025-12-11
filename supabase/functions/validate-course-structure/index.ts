import { withCors } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const rl = rateLimit(req); if (rl) return rl;

  try {
    const provided = req.headers.get("X-Agent-Token") || "";
    if (!provided || provided !== AGENT_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const body = await req.json() as { courseId: string };
    const courseId = body?.courseId;
    if (!courseId) {
      return new Response(JSON.stringify({ error: "Invalid courseId" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Load course from storage (public path acceptable)
    const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${courseId}/course.json`;
    const resp = await fetch(url);
    if (!resp.ok) {
      return new Response(JSON.stringify({ ok: false, issues: ["course_not_found"] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const course = await resp.json();

    const issues: string[] = [];
    if (!course?.title) issues.push("missing_title");
    if (!Array.isArray(course?.items) || course.items.length === 0) issues.push("no_items");

    const items: any[] = Array.isArray(course?.items) ? course.items : [];
    items.forEach((it, idx) => {
      const mode = it?.mode || 'options';
      if (mode === 'options') {
        const options = Array.isArray(it?.options) ? it.options : [];
        const ci = typeof it?.correctIndex === 'number' ? it.correctIndex : -1;
        if (options.length < 3 || options.length > 4) issues.push(`item_${idx}_options_count_invalid`);
        if (ci < 0 || ci >= options.length) issues.push(`item_${idx}_correctIndex_invalid`);
      } else if (mode === 'numeric') {
        if (typeof it?.answer !== 'number') issues.push(`item_${idx}_missing_numeric_answer`);
      } else {
        issues.push(`item_${idx}_unknown_mode`);
      }
    });

    const ok = issues.length === 0;
    return new Response(JSON.stringify({ ok, issues }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || "Invalid JSON" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
}));


