import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
if (!AGENT_TOKEN) throw new Error("AGENT_TOKEN is required");

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Body = {
  courseId: string;
  itemId: number;
  prompt: string;
  provider?: string;
  style?: string;
  idempotencyKey?: string;
  targetRef?: Record<string, unknown> | null;
};

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const provided = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
  if (provided !== AGENT_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const courseId = String(body?.courseId || "").trim();
  const itemId = Number(body?.itemId);
  const prompt = String(body?.prompt || "").trim();
  const provider = String(body?.provider || "openai-dalle3").trim();
  const style = body?.style ? String(body.style) : undefined;
  const idempotencyKey = body?.idempotencyKey ? String(body.idempotencyKey) : undefined;

  if (!courseId || !Number.isFinite(itemId) || itemId < 0 || !prompt) {
    return new Response(JSON.stringify({ error: "Invalid request: courseId, itemId, prompt are required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const insert = {
    course_id: courseId,
    item_id: itemId,
    media_type: "image",
    prompt,
    provider,
    idempotency_key: idempotencyKey ?? null,
    metadata: {
      style: style ?? null,
      targetRef: body?.targetRef ?? null,
    },
    status: "pending",
  };

  const { data, error } = await adminSupabase
    .from("ai_media_jobs")
    .insert(insert)
    .select("id,status")
    .single();

  if (error) {
    // Idempotency conflict: return the existing job id if we can
    if (error.code === "23505" && idempotencyKey) {
      const { data: existing, error: existingErr } = await adminSupabase
        .from("ai_media_jobs")
        .select("id,status")
        .eq("idempotency_key", idempotencyKey)
        .limit(1)
        .single();
      if (!existingErr && existing?.id) {
        return new Response(JSON.stringify({ ok: true, mediaJobId: existing.id, status: existing.status }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }
    }

    return new Response(JSON.stringify({ error: { code: "invalid_request", message: error.message } }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  return new Response(JSON.stringify({ ok: true, mediaJobId: data.id, status: data.status }), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
  });
});

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


