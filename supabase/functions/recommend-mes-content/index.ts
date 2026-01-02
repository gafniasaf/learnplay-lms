import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
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

type IndexDocMeta = { title?: string; url?: string; indexed_at?: string; chunk_count?: number };

async function loadMesIndexMeta(orgId: string): Promise<Record<string, IndexDocMeta> | null> {
  const indexPath = `${orgId}/mes-corpus/index.json`;
  const { data, error } = await adminSupabase.storage.from("materials").download(indexPath);
  if (error || !data) return null;
  try {
    const text = await data.text();
    const json = text ? JSON.parse(text) : null;
    const docs = json?.documents;
    if (!docs || typeof docs !== "object") return null;
    return docs as Record<string, IndexDocMeta>;
  } catch {
    return null;
  }
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

    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      return json({ ok: false, error: { code: "invalid_request", message: "query is required" }, httpStatus: 400, requestId }, 200);
    }

    const limitRaw = typeof body?.limit === "number" && Number.isFinite(body.limit) ? Math.floor(body.limit) : 5;
    const limit = Math.min(20, Math.max(1, limitRaw));

    const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
    const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

    const embedding = await generateEmbedding(query, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });

    const { data: matches, error: matchErr } = await adminSupabase.rpc("match_content_embeddings_prefix", {
      p_organization_id: organizationId,
      p_course_id_prefix: "mes:",
      p_query_embedding: embedding,
      p_limit: Math.min(50, Math.max(limit * 5, 10)),
    });
    if (matchErr) {
      return json({ ok: false, error: { code: "internal_error", message: `match_content_embeddings_prefix failed: ${matchErr.message}` }, httpStatus: 500, requestId }, 200);
    }

    const meta = await loadMesIndexMeta(organizationId);

    type Row = { course_id?: string; item_index?: number; text_content?: string; similarity?: number };
    const rows: Row[] = Array.isArray(matches) ? (matches as any[]) : [];

    const byDoc = new Map<string, { doc_id: string; title?: string; url?: string; best: number; matches: Array<{ item_index: number; similarity: number; text: string }> }>();

    for (const r of rows) {
      const courseId = typeof r?.course_id === "string" ? r.course_id : "";
      if (!courseId.startsWith("mes:")) continue;
      const docId = courseId.slice("mes:".length) || courseId;
      const sim = Number(r?.similarity ?? 0);
      const idx = Number.isFinite(Number(r?.item_index)) ? Number(r?.item_index) : -1;
      const text = typeof r?.text_content === "string" ? r.text_content : "";
      if (!text.trim() || idx < 0) continue;

      const existing = byDoc.get(docId) || {
        doc_id: docId,
        title: meta?.[docId]?.title,
        url: meta?.[docId]?.url,
        best: -1,
        matches: [],
      };
      existing.best = Math.max(existing.best, sim);
      existing.matches.push({ item_index: idx, similarity: sim, text });
      byDoc.set(docId, existing);
    }

    const results = Array.from(byDoc.values())
      .map((d) => ({
        doc_id: d.doc_id,
        title: d.title,
        url: d.url,
        score: d.best,
        matches: d.matches
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return json({ ok: true, query, results, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[recommend-mes-content] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


