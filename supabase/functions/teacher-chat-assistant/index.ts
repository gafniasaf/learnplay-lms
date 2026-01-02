import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import { chat as chatLLM, getProvider } from "../_shared/ai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v;
}

async function generateEmbedding(text: string, opts: { apiKey: string; model: string }): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("Embeddings response missing embedding array");
  return emb as number[];
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) throw new Error("BLOCKED: messages must be an array");
  const out: ChatMessage[] = [];
  for (const m of raw) {
    const obj = (m && typeof m === "object") ? (m as Record<string, unknown>) : {};
    const role = obj.role;
    const content = obj.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.trim() });
  }
  if (out.length === 0) throw new Error("BLOCKED: messages must include at least one user message");
  return out;
}

function latestUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages[messages.length - 1].content;
}

async function resolveUserMetaRole(args: { authType: "agent" | "user"; req: Request; userId?: string }): Promise<string | null> {
  if (args.authType === "user") {
    const authHeader = args.req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    const role =
      (data.user.user_metadata?.role as string | undefined) ??
      (data.user.app_metadata?.role as string | undefined) ??
      null;
    return role ? String(role) : null;
  }

  // Agent calls: if userId provided, look up auth user metadata via admin API.
  const userId = args.userId;
  if (!userId) return null;
  const { data, error } = await adminSupabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const role =
    (data.user.user_metadata?.role as string | undefined) ??
    (data.user.app_metadata?.role as string | undefined) ??
    null;
  return role ? String(role) : null;
}

async function isOrgAdminOrEditor(args: { userId?: string; organizationId: string }): Promise<boolean> {
  const userId = args.userId;
  if (!userId) return false;
  const { data, error } = await adminSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", args.organizationId);
  if (error) return false;
  const roles = Array.isArray(data) ? data.map((r: any) => String(r?.role || "")) : [];
  return roles.includes("org_admin") || roles.includes("editor");
}

type Citation = {
  source: "material" | "mes";
  course_id: string;
  item_index: number;
  similarity: number;
  text: string;
};

async function retrievePrefix(args: {
  organizationId: string;
  prefix: string;
  embedding: number[];
  limit: number;
}): Promise<Citation[]> {
  const { data, error } = await adminSupabase.rpc("match_content_embeddings_prefix", {
    p_organization_id: args.organizationId,
    p_course_id_prefix: args.prefix,
    p_query_embedding: args.embedding,
    p_limit: args.limit,
  });
  if (error) throw new Error(`match_content_embeddings_prefix failed: ${error.message}`);
  const rows: any[] = Array.isArray(data) ? data : [];
  return rows
    .map((r) => ({
      course_id: String(r?.course_id || ""),
      item_index: Number(r?.item_index ?? -1),
      similarity: Number(r?.similarity ?? 0),
      text: String(r?.text_content ?? ""),
    }))
    .filter((r) => r.course_id && Number.isFinite(r.item_index) && r.item_index >= 0 && r.text.trim())
    .map((r) => ({
      source: args.prefix.startsWith("mes:") ? "mes" : "material",
      course_id: r.course_id,
      item_index: r.item_index,
      similarity: r.similarity,
      text: r.text,
    }));
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method not allowed" }, httpStatus: 405, requestId }, 200);
  }

  try {
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, httpStatus: 401, requestId }, 200);
    }

    const organizationId = requireOrganizationId(auth);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    const messages = parseMessages(body?.messages);
    const scopeRaw = typeof body?.scope === "string" ? body.scope.trim().toLowerCase() : "all";
    const scope = (scopeRaw === "materials" || scopeRaw === "mes" || scopeRaw === "all") ? scopeRaw : "all";
    const materialId = typeof body?.materialId === "string" ? body.materialId.trim() : "";

    // Authorization: teacher/admin parity gate
    // - Teachers have user_metadata.role='teacher'
    // - Admins have user_roles org_admin/editor (metadata role may be absent)
    if (auth.type === "user") {
      const metaRole = await resolveUserMetaRole({ authType: "user", req, userId: auth.userId });
      const isAdmin = await isOrgAdminOrEditor({ userId: auth.userId, organizationId });
      const ok = metaRole === "teacher" || isAdmin;
      if (!ok) {
        return json({ ok: false, error: { code: "forbidden", message: "TeacherGPT is restricted to teachers/admins" }, httpStatus: 403, requestId }, 200);
      }
    }
    // Agent calls are trusted (AGENT_TOKEN is privileged); used for tests/ops.

    // LLM prereqs
    const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
    const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

    // Ensure we have a chat provider configured (for the answer generation).
    // We avoid fallbacks; if nothing configured, fail loudly.
    if (getProvider() === "none") {
      return json({
        ok: false,
        error: { code: "blocked", message: "BLOCKED: OPENAI_API_KEY (or ANTHROPIC_API_KEY) is REQUIRED for teacher-chat-assistant" },
        httpStatus: 500,
        requestId,
      }, 200);
    }

    const queryText = latestUserMessage(messages);
    const embedding = await generateEmbedding(queryText, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });

    const topK = Math.min(20, Math.max(3, Number.isFinite(Number(body?.topK)) ? Math.floor(Number(body.topK)) : 8));

    let citations: Citation[] = [];
    if (scope === "materials") {
      const prefix = materialId ? `material:${materialId}` : "material:";
      citations = await retrievePrefix({ organizationId, prefix, embedding, limit: topK });
    } else if (scope === "mes") {
      citations = await retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: topK });
    } else {
      const [mat, mes] = await Promise.all([
        retrievePrefix({ organizationId, prefix: materialId ? `material:${materialId}` : "material:", embedding, limit: Math.ceil(topK / 2) + 2 }),
        retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: Math.ceil(topK / 2) + 2 }),
      ]);
      citations = [...mat, ...mes]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    }

    const citedContext = citations
      .slice(0, 12)
      .map((c, i) => {
        const n = i + 1;
        const src = c.source === "mes" ? "MES" : "Material";
        return `[${n}] (${src}, ${c.course_id}, chunk ${c.item_index}, sim ${c.similarity.toFixed(3)}):\n${c.text}`;
      })
      .join("\n\n");

    const system = [
      "You are TeacherGPT inside LearnPlay.",
      "You answer teacher questions using the provided sources only.",
      "If the sources are insufficient, say so and ask a clarifying question.",
      "Cite sources by writing [1], [2], etc. matching the provided source list.",
      "",
      "SOURCES:",
      citedContext || "(no sources found)",
    ].join("\n");

    const llmResp = await chatLLM({
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 900,
      temperature: 0.3,
      timeoutMs: 90_000,
    });

    if (!llmResp.ok) {
      const msg = llmResp.error === "no_provider"
        ? "BLOCKED: OPENAI_API_KEY (or ANTHROPIC_API_KEY) is REQUIRED for teacher-chat-assistant"
        : llmResp.error;
      return json({ ok: false, error: { code: "blocked", message: msg }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      answer: llmResp.text,
      citations: citations.slice(0, 12),
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[teacher-chat-assistant] Unhandled error (${requestId}):`, message);
    return new Response(
      JSON.stringify({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }) },
    );
  }
});


