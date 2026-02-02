import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

type ChatMessage = { role: "user" | "assistant"; content: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function json(req: Request, body: unknown, status = 200, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: stdHeaders(req, {
      "Content-Type": "application/json",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    }),
  });
}

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) throw new Error("BLOCKED: messages must be an array");
  const out: ChatMessage[] = [];
  for (const m of raw) {
    const obj = isRecord(m) ? m : {};
    const role = obj.role;
    const content = obj.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.trim() });
  }
  if (!out.length) throw new Error("BLOCKED: messages must contain at least 1 non-empty item");
  return out;
}

function latestUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages.length ? messages[messages.length - 1].content : "";
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return handleOptions(req, "teacher-chat-assistant");
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: stdHeaders(req) });

  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(
        req,
        { ok: false, error: { code: "blocked", message: "BLOCKED: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" }, httpStatus: 500, requestId },
        200,
        requestId,
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const auth = await authenticateRequest(req);
    const organizationId = requireOrganizationId(auth);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(req, { ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200, requestId);
    }

    const messages = parseMessages(isRecord(body) ? body.messages : undefined);
    const scopeRaw = isRecord(body) && typeof body.scope === "string" ? body.scope.trim().toLowerCase() : "all";
    const scope = scopeRaw === "materials" || scopeRaw === "mes" || scopeRaw === "all" ? scopeRaw : "all";
    const materialId = isRecord(body) && typeof body.materialId === "string" ? body.materialId.trim() : "";
    const topKRaw = isRecord(body) ? (body as any).topK : undefined;
    const topK = Math.min(20, Math.max(3, Number.isFinite(Number(topKRaw)) ? Math.floor(Number(topKRaw)) : 8));

    // Authorization:
    // - agent token: trusted (used for preview/tests/ops)
    // - user token: teacher OR org_admin/org_editor
    if (auth.type === "user") {
      const userId = String(auth.userId || "").trim();
      if (!userId) throw new Error("Unauthorized: missing userId");

      let metaRole = "";
      try {
        const { data: userData } = await admin.auth.admin.getUserById(userId);
        metaRole = typeof (userData as any)?.user?.user_metadata?.role === "string" ? String((userData as any).user.user_metadata.role) : "";
      } catch {
        metaRole = "";
      }

      if (metaRole !== "teacher") {
        const { data: roles, error: roleErr } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("organization_id", organizationId)
          .in("role", ["org_admin", "org_editor"]);
        if (roleErr) throw new Error(`user_roles_check_failed:${roleErr.message}`);
        const ok = Array.isArray(roles) && roles.length > 0;
        if (!ok) {
          return json(
            req,
            { ok: false, error: { code: "forbidden", message: "TeacherGPT is restricted to teachers/admins" }, httpStatus: 403, requestId },
            200,
            requestId,
          );
        }
      }
    }

    const queryText = latestUserMessage(messages);

    const insert: Record<string, unknown> = {
      organization_id: organizationId,
      job_type: "teacher_chat_assistant",
      status: "queued",
      payload: {
        step: "init",
        queryText,
        messages,
        scope,
        materialId,
        topK,
      },
    };

    if (auth.userId) insert.created_by = auth.userId;

    const { data: created, error: createErr } = await admin.from("ai_agent_jobs").insert(insert).select("id").single();
    if (createErr || !created?.id) {
      console.error(`[teacher-chat-assistant] enqueue_failed (${requestId}):`, createErr);
      return json(
        req,
        { ok: false, error: { code: "internal_error", message: "Failed to enqueue TeacherGPT job" }, httpStatus: 500, requestId },
        200,
        requestId,
      );
    }

    const jobId = String((created as any).id);
    return json(
      req,
      {
        ok: true,
        answer: "Ik ga dit uitwerken. Dit kan 1–3 minuten duren. Ik laat het weten zodra het klaar is.",
        citations: [],
        recommendations: [],
        requestId,
        jobId,
      },
      200,
      requestId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[teacher-chat-assistant] Unhandled error (${requestId}):`, message);
    return json(req, { ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200, requestId);
  }
});

