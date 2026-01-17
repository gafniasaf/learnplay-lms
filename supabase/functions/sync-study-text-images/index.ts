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
};

function json(req: Request, body: Record<string, unknown>, requestId: string, status = 200): Response {
  return new Response(JSON.stringify({ ...body, requestId }), {
    status,
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
  });
}

function replaceFirstImageMarker(content: string, url: string): string {
  const s = String(content || "");
  const re = /\[IMAGE:[^\]]+\]/;
  if (re.test(s)) {
    return s.replace(re, `[IMAGE:${url}]`);
  }
  return `${s}${s.trim().length ? "\n\n" : ""}[IMAGE:${url}]`;
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
  if (!courseId) {
    return json(req, { ok: false, error: { code: "invalid_request", message: "courseId is required" }, httpStatus: 400 }, requestId, 200);
  }

  try {
    const { data: jobs, error: jobsErr } = await adminSupabase
      .from("ai_media_jobs")
      .select("id,result_url,metadata,created_at,status")
      .eq("course_id", courseId)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(200);

    if (jobsErr) {
      return json(req, { ok: false, error: { code: "db_error", message: jobsErr.message ?? String(jobsErr) } }, requestId, 200);
    }

    const sectionToUrl = new Map<string, string>();
    for (const j of jobs ?? []) {
      const url = typeof (j as any)?.result_url === "string" ? String((j as any).result_url).trim() : "";
      if (!url) continue;
      const tr = (j as any)?.metadata?.targetRef;
      const type = tr && typeof tr === "object" ? (tr as any).type : null;
      if (type !== "study_text") continue;
      const sectionId = typeof (tr as any).sectionId === "string" ? String((tr as any).sectionId).trim() : "";
      if (!sectionId) continue;
      // jobs are ordered newest-first; first seen per section wins.
      if (!sectionToUrl.has(sectionId)) sectionToUrl.set(sectionId, url);
    }

    if (sectionToUrl.size === 0) {
      return json(req, { ok: true, updated: 0, message: "No completed study_text media jobs found" }, requestId, 200);
    }

    const { data: file, error: dlErr } = await adminSupabase.storage.from("courses").download(`${courseId}/course.json`);
    if (dlErr || !file) {
      return json(req, { ok: false, error: { code: "not_found", message: `course.json not found for ${courseId}` } }, requestId, 200);
    }

    const text = await file.text();
    const jsonData = JSON.parse(text);
    const isEnvelope = jsonData && typeof jsonData === "object" && "content" in jsonData && "format" in jsonData;
    const content = isEnvelope ? (jsonData.content ?? {}) : jsonData;

    const studyTexts = Array.isArray(content.studyTexts) ? content.studyTexts : [];
    let updatedCount = 0;
    const updatedSections: string[] = [];

    for (let i = 0; i < studyTexts.length; i++) {
      const st = studyTexts[i];
      const id = typeof st?.id === "string" ? String(st.id) : "";
      const url = id ? sectionToUrl.get(id) : null;
      if (!id || !url) continue;
      const originalContent = String(st?.content || "");
      const nextContent = replaceFirstImageMarker(originalContent, url);
      if (nextContent !== originalContent) {
        studyTexts[i] = { ...st, content: nextContent };
        updatedCount++;
        updatedSections.push(id);
      }
    }

    const updated = isEnvelope
      ? { ...jsonData, content: { ...content, studyTexts } }
      : { ...content, studyTexts };

    const blob = new Blob([JSON.stringify(updated, null, 2)], { type: "application/json" });
    const { error: upErr } = await adminSupabase.storage.from("courses").upload(`${courseId}/course.json`, blob, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "public, max-age=60",
    });
    if (upErr) {
      return json(req, { ok: false, error: { code: "storage_write_failed", message: upErr.message ?? String(upErr) } }, requestId, 200);
    }

    return json(req, { ok: true, updated: updatedCount, updatedSections }, requestId, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(req, { ok: false, error: { code: "internal_error", message: msg } }, requestId, 200);
  }
});


