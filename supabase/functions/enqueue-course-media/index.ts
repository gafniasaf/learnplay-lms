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

interface Body {
  courseId: string;
  itemId?: number;
  prompt: string;
  provider?: string;
  style?: string;
  targetRef?: Record<string, unknown>;
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
    const body = await req.json() as Partial<Body>;
    const courseId = String(body.courseId || "").trim();
    const itemId = typeof body.itemId === "number" ? body.itemId : undefined;
    const prompt = String(body.prompt || "").trim();
    const provider = String(body.provider || "openai");
    const style = body.style ? String(body.style) : undefined;

    if (!courseId || !prompt) {
      return Errors.invalidRequest("Missing courseId or prompt", reqId, req) as any;
    }

    // Use generic enqueue with jobType=image
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Token": AGENT_TOKEN,
      },
      body: JSON.stringify({
        jobType: "image",
        courseId,
        itemRef: itemId != null ? { type: "item_stimulus", itemId } : (body.targetRef || {}),
        payload: { prompt, provider, style, targetRef: body.targetRef || null },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return Errors.internal(`enqueue failed (${resp.status}): ${txt}`, reqId, req) as any;
    }

    const data = await resp.json();
    return new Response(JSON.stringify({ ok: true, mediaJobId: data?.jobId || null }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return Errors.invalidRequest(message, reqId, req) as any;
  }
}));


