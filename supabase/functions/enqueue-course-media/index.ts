import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || null;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN") || null;

const adminSupabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

type Body = {
  courseId: string;
  itemId: number;
  prompt: string;
  provider?: string; // provider id, e.g. openai-dalle3 / replicate-sdxl
  style?: string;
  idempotencyKey?: string;
  targetRef?: Record<string, unknown> | null;
};

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !AGENT_TOKEN || !adminSupabase) {
    return new Response(JSON.stringify({
      error: {
        code: "blocked",
        message: "BLOCKED: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AGENT_TOKEN are required",
      },
      requestId,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  const provided = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
  if (provided !== AGENT_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  const courseId = String(body?.courseId || "").trim();
  const itemId = Number(body?.itemId);
  const prompt = String(body?.prompt || "").trim();
  const providerId = String(body?.provider || "openai-dalle3").trim();
  const providerFamily =
    providerId.startsWith("replicate") ? "replicate"
    : providerId.startsWith("elevenlabs") ? "elevenlabs"
    : "openai";
  const style = body?.style ? String(body.style) : undefined;
  const idempotencyKey = body?.idempotencyKey ? String(body.idempotencyKey) : undefined;

  if (!courseId || !Number.isFinite(itemId) || itemId < 0 || !prompt) {
    return new Response(JSON.stringify({ error: "Invalid request: courseId, itemId, prompt are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  const insert = {
    course_id: courseId,
    item_id: itemId,
    media_type: "image",
    prompt,
    provider: providerFamily,
    idempotency_key: idempotencyKey ?? null,
    metadata: {
      style: style ?? null,
      targetRef: body?.targetRef ?? null,
      provider_id: providerId,
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
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        });
      }
    }

    return new Response(JSON.stringify({ error: { code: "invalid_request", message: error.message } }), {
      status: 400,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  }

  return new Response(JSON.stringify({ ok: true, mediaJobId: data.id, status: data.status }), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
  });
}));
