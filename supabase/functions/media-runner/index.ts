import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { getProvider } from "../_shared/media-providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
if (!AGENT_TOKEN) throw new Error("AGENT_TOKEN is required");

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type MediaJobRow = {
  id: string;
  course_id: string;
  item_id: number;
  media_type: "image" | "audio" | "video";
  prompt: string;
  provider: string | null;
  metadata?: Record<string, unknown> | null;
};

async function pickNextPending(): Promise<MediaJobRow | null> {
  // Prefer RPC (atomic); fallback to select.
  const { data: rpcData, error: rpcErr } = await adminSupabase.rpc("get_next_pending_media_job");
  if (!rpcErr && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return row ? (row as MediaJobRow) : null;
  }

  const { data, error } = await adminSupabase
    .from("ai_media_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const job = (data ?? [])[0] as any;
  if (!job) return null;
  await adminSupabase
    .from("ai_media_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", job.id);
  return job as MediaJobRow;
}

async function uploadToMediaLibrary(courseId: string, itemId: number, bytes: Uint8Array, contentType: string) {
  const ext = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "bin";
  const path = `courses/${courseId}/items/${itemId}/${crypto.randomUUID()}.${ext}`;
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: contentType });
  const { error } = await adminSupabase.storage.from("media-library").upload(path, blob, {
    upsert: true,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = adminSupabase.storage.from("media-library").getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

async function attachImageToCourse(courseId: string, itemId: number, publicUrl: string) {
  const { data: file, error: dlErr } = await adminSupabase.storage.from("courses").download(`${courseId}/course.json`);
  if (dlErr || !file) throw new Error(`Failed to download course.json: ${dlErr?.message ?? "missing"}`);

  const text = await file.text();
  const json = JSON.parse(text);
  const isEnvelope = json && typeof json === "object" && "content" in json && "format" in json;
  const content = isEnvelope ? (json.content ?? {}) : json;

  const items = Array.isArray(content.items) ? content.items : [];
  const idx = items.findIndex((it: any) => (it?.id ?? -1) === itemId);
  if (idx === -1) return;

  items[idx] = {
    ...items[idx],
    stimulus: { type: "image", url: publicUrl, alt: `Illustration for item ${itemId}` },
  };

  const updated = isEnvelope ? { ...json, content: { ...content, items } } : { ...content, items };
  const blob = new Blob([JSON.stringify(updated, null, 2)], { type: "application/json" });
  const { error: upErr } = await adminSupabase.storage.from("courses").upload(`${courseId}/course.json`, blob, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "public, max-age=60",
  });
  if (upErr) throw new Error(`Failed to upload updated course.json: ${upErr.message}`);
}

async function markJob(id: string, patch: Record<string, unknown>) {
  const { error } = await adminSupabase.from("ai_media_jobs").update(patch).eq("id", id);
  if (error) throw new Error(`Failed to update job: ${error.message}`);
}

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
    // IMPORTANT: avoid non-200 to prevent Lovable blank screens.
    return new Response(JSON.stringify({ ok: false, error: { code: "unauthorized", message: "Unauthorized" }, httpStatus: 401, requestId }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const url = new URL(req.url);
  const n = Math.min(Math.max(Number(url.searchParams.get("n") || "1"), 1), 25);

  const results: Array<{ id: string; status: string; resultUrl?: string; error?: string }> = [];
  for (let i = 0; i < n; i++) {
    const job = await pickNextPending();
    if (!job) break;

    try {
      if (job.media_type !== "image") {
        throw new Error(`Unsupported media_type: ${job.media_type}`);
      }

      const metaProviderId = (job.metadata as any)?.provider_id;
      const providerId =
        typeof metaProviderId === "string" && metaProviderId.trim()
          ? metaProviderId.trim()
          : job.provider === "replicate"
            ? "replicate-sdxl"
            : job.provider === "openai"
              ? "openai-dalle3"
              : "openai-dalle3";
      const provider = getProvider(providerId);
      if (!provider || !provider.enabled) {
        throw new Error(`Media provider not enabled: ${providerId}`);
      }

      const result = await provider.generate({
        mediaType: "image",
        prompt: job.prompt,
        targetRef: { type: "item_stimulus", courseId: job.course_id, itemId: job.item_id },
      });

      const imgResp = await fetch(result.url);
      if (!imgResp.ok) {
        throw new Error(`Failed to fetch generated image: ${imgResp.status} ${imgResp.statusText}`);
      }
      const contentType = imgResp.headers.get("content-type") || "image/png";
      const bytes = new Uint8Array(await imgResp.arrayBuffer());

      const uploaded = await uploadToMediaLibrary(job.course_id, job.item_id, bytes, contentType);
      await attachImageToCourse(job.course_id, job.item_id, uploaded.publicUrl);

      await markJob(job.id, {
        status: "done",
        result_url: uploaded.publicUrl,
        metadata: result.metadata,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      results.push({ id: job.id, status: "done", resultUrl: uploaded.publicUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJob(job.id, {
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      results.push({ id: job.id, status: "failed", error: msg });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
  });
});


