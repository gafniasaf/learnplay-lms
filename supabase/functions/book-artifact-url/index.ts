/**
 * book-artifact-url (HYBRID AUTH)
 *
 * Issues a signed download URL for a specific book_artifacts row.
 *
 * Request (POST):
 * { artifactId: string, expiresIn?: number }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Body {
  artifactId: string;
  expiresIn?: number;
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

    const orgId = requireOrganizationId(auth);

    let body: Body;
    try {
      body = await req.json() as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!body?.artifactId || typeof body.artifactId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "artifactId is required" }, httpStatus: 400, requestId }, 200);
    }

    const expiresIn = typeof body.expiresIn === "number" && body.expiresIn > 0 ? Math.min(body.expiresIn, 60 * 60 * 24) : 3600;

    const { data: artifact, error: artErr } = await adminSupabase
      .from("book_artifacts")
      .select("id, run_id, path, kind, chapter_index, created_at")
      .eq("id", body.artifactId)
      .single();

    if (artErr || !artifact) {
      return json({ ok: false, error: { code: "not_found", message: "Artifact not found" }, httpStatus: 404, requestId }, 200);
    }

    // Enforce org boundary via run
    const { data: run, error: runErr } = await adminSupabase
      .from("book_runs")
      .select("id, organization_id, book_id, book_version_id")
      .eq("id", artifact.run_id)
      .single();

    if (runErr || !run) {
      return json({ ok: false, error: { code: "not_found", message: "Run not found" }, httpStatus: 404, requestId }, 200);
    }

    if (run.organization_id !== orgId) {
      return json({ ok: false, error: { code: "forbidden", message: "Artifact belongs to a different organization" }, httpStatus: 403, requestId }, 200);
    }

    const { data, error } = await adminSupabase.storage.from("books").createSignedUrl(artifact.path, expiresIn);
    if (error || !data?.signedUrl) {
      console.error("[book-artifact-url] createSignedUrl error:", error);
      return json({ ok: false, error: { code: "storage_error", message: error?.message || "Failed to create signed URL" }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      artifact: {
        id: artifact.id,
        runId: artifact.run_id,
        bookId: run.book_id,
        bookVersionId: run.book_version_id,
        kind: artifact.kind,
        chapterIndex: artifact.chapter_index,
        path: artifact.path,
        createdAt: artifact.created_at,
      },
      signedUrl: data.signedUrl,
      expiresIn,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-artifact-url] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


