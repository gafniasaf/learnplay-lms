import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Minimal Deno shim for local TypeScript tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(key: string): string | undefined } } | any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !AGENT_TOKEN) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and AGENT_TOKEN are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Body = {
  courseId: string;
  status?: "failed" | "processing" | "done" | "pending";
  errorContains?: string;
  limit?: number;
};

function json(req: Request, body: unknown, requestId: string, status = 200): Response {
  return new Response(JSON.stringify({ ...body, requestId }), {
    status,
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
  });
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    return json(req, { ok: false, error: { code: "method_not_allowed", message: "Method Not Allowed" } }, requestId, 200);
  }

  const provided = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
  if (provided !== AGENT_TOKEN) {
    // IMPORTANT: avoid non-200 to prevent Lovable blank screens.
    return json(req, { ok: false, error: { code: "unauthorized", message: "Unauthorized" }, httpStatus: 401 }, requestId, 200);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(req, { ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400 }, requestId, 200);
  }

  const courseId = String(body?.courseId || "").trim();
  const status = body?.status || "failed";
  const errorContains = typeof body?.errorContains === "string" ? body.errorContains.trim() : "";
  const limitRaw = typeof body?.limit === "number" ? body.limit : 100;
  const limit = Math.min(Math.max(Math.floor(limitRaw), 1), 500);

  if (!courseId) {
    return json(req, { ok: false, error: { code: "invalid_request", message: "courseId is required" }, httpStatus: 400 }, requestId, 200);
  }

  try {
    // Collect target ids first (bounded), then update them. This avoids accidental massive updates.
    let sel = adminSupabase
      .from("ai_media_jobs")
      .select("id,error,status")
      .eq("course_id", courseId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (errorContains) {
      sel = sel.ilike("error", `%${errorContains}%`);
    }

    const { data: rows, error: selErr } = await sel;
    if (selErr) {
      return json(req, { ok: false, error: { code: "db_error", message: selErr.message ?? String(selErr) } }, requestId, 200);
    }

    const ids = (rows ?? []).map((r: any) => r?.id).filter((x: any) => typeof x === "string") as string[];
    if (ids.length === 0) {
      return json(req, { ok: true, updated: 0, ids: [] }, requestId, 200);
    }

    const patch = {
      status: "pending",
      error: null,
      started_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
      result_url: null,
    };

    const { data: updated, error: upErr } = await adminSupabase
      .from("ai_media_jobs")
      .update(patch)
      .in("id", ids)
      .select("id,status");

    if (upErr) {
      return json(req, { ok: false, error: { code: "db_error", message: upErr.message ?? String(upErr) } }, requestId, 200);
    }

    return json(req, { ok: true, updated: Array.isArray(updated) ? updated.length : ids.length, ids }, requestId, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(req, { ok: false, error: { code: "internal_error", message: msg } }, requestId, 200);
  }
});


