import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!AGENT_TOKEN) {
  throw new Error("AGENT_TOKEN is required");
}

type CoPilotAction = "variants" | "enrich" | "localize";

interface CoPilotBody {
  action: CoPilotAction;
  subject?: string;
  format?: string;
  courseId?: string;
  locale?: string;
  extra?: Record<string, unknown>;
}

Deno.serve(withCors(async (req: Request) => {
  const reqId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return Errors.methodNotAllowed(req.method, reqId, req) as any;
  }

  const rl = rateLimit(req);
  if (rl) return rl;

  try {
    const body = (await req.json()) as Partial<CoPilotBody>;
    const action = (body.action || "variants") as CoPilotAction;
    const subject = body.subject || "Untitled Course";
    const format = body.format || (action === "enrich" ? "explainer" : "practice");

    // Map high-level editor actions to enqueue-job parameters
    const extra: Record<string, unknown> = {
      ...(body.extra || {}),
    };
    if (action === "variants") {
      extra.intent = "generate_variants";
    } else if (action === "enrich") {
      extra.intent = "enrich_study_texts";
    } else if (action === "localize") {
      extra.intent = "localize_course";
      if (body.locale) extra.locale = body.locale;
    }

    // Call Agent API: enqueue-job
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Token": AGENT_TOKEN,
      },
      body: JSON.stringify({
        subject,
        format,
        courseId: body.courseId || null,
        extra,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return Errors.internal(`enqueue failed (${resp.status}): ${txt}`, reqId, req) as any;
    }

    const data = await resp.json();
    return new Response(JSON.stringify({ ok: true, jobId: data.jobId, action, subject, format }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return Errors.invalidRequest(message, reqId, req) as any;
  }
}));


