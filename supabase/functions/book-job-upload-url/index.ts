/**
 * book-job-upload-url (AGENT ONLY)
 *
 * Issues a signed upload URL for the books bucket for a specific job artifact.
 *
 * Request (POST):
 * { jobId: string, fileName: string }
 *
 * Response:
 * { ok: true, signedUrl: string, path: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Body {
  jobId: string;
  fileName: string;
}

function isSafeFileName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return /^[a-zA-Z0-9._-]+$/.test(name);
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

    if (auth.type !== "agent") {
      return json({ ok: false, error: { code: "unauthorized", message: "Agent token required" }, httpStatus: 401, requestId }, 200);
    }

    let body: Body;
    try {
      body = await req.json() as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!body?.jobId || typeof body.jobId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "jobId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!body?.fileName || typeof body.fileName !== "string" || !isSafeFileName(body.fileName)) {
      return json({ ok: false, error: { code: "invalid_request", message: "fileName is required and must be a safe filename" }, httpStatus: 400, requestId }, 200);
    }

    const { data: job, error: jobErr } = await adminSupabase
      .from("book_render_jobs")
      .select("id, run_id, book_id, book_version_id")
      .eq("id", body.jobId)
      .single();

    if (jobErr || !job) {
      return json({ ok: false, error: { code: "not_found", message: "Job not found" }, httpStatus: 404, requestId }, 200);
    }

    const objectPath = `${job.book_id}/${job.book_version_id}/runs/${job.run_id}/jobs/${job.id}/${body.fileName}`;

    const { data, error } = await adminSupabase.storage
      .from("books")
      .createSignedUploadUrl(objectPath);

    if (error || !data?.signedUrl) {
      console.error("[book-job-upload-url] createSignedUploadUrl error:", error);
      return json({ ok: false, error: { code: "storage_error", message: error?.message || "Failed to create signed upload URL" }, httpStatus: 500, requestId }, 200);
    }

    return json({ ok: true, signedUrl: data.signedUrl, path: data.path, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-job-upload-url] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


