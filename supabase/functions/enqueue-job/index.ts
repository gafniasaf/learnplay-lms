import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

// Create admin client for DB operations
const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Idempotency support:
// - Client sends Idempotency-Key header
// - We derive a deterministic job id from it (UUIDv5-ish) so retries don't double-enqueue
const IDEMPOTENCY_NAMESPACE_UUID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error("Invalid UUID");
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

async function deterministicJobIdFromKey(key: string): Promise<string> {
  const ns = uuidToBytes(IDEMPOTENCY_NAMESPACE_UUID);
  const name = new TextEncoder().encode(key);
  const data = new Uint8Array(ns.length + name.length);
  data.set(ns, 0);
  data.set(name, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data)).slice(0, 16);
  // UUID version 5 + RFC variant bits
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string };
  const msg = (e?.message || "").toLowerCase();
  const details = (e?.details || "").toLowerCase();
  return (
    e?.code === "23505" ||
    msg.includes("duplicate") ||
    details.includes("duplicate")
  );
}

interface EnqueueBody {
  jobType?: string;
  payload?: Record<string, unknown>;
  runSync?: boolean; // Force synchronous execution (for testing/short jobs)
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: any, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req, { "X-Request-Id": requestId }),
    });
  }

  try {
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      // IMPORTANT: Lovable preview can blank-screen on non-200 responses.
      // Return HTTP 200 with a structured failure payload.
      const httpStatus = message === "Missing organization_id" ? 400 : 401;
      const code =
        message === "Missing organization_id" ? "missing_organization_id" :
        message.toLowerCase().includes("unauthorized") ? "unauthorized" :
        "unauthorized";
      return json({ ok: false, error: { code, message }, httpStatus, requestId }, 200);
    }

    let body: EnqueueBody;
    try {
      body = await req.json() as EnqueueBody;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!body?.jobType || typeof body.jobType !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "jobType is required" }, httpStatus: 400, requestId }, 200);
    }

    const payload = body.payload ?? {};
    // For now, we only validate org presence (even if this function doesn't yet filter by it).
    // This keeps the system consistent with hybrid auth expectations.
    const organizationId = requireOrganizationId(auth);

    // Supported job types: ai_course_generate uses ai_course_jobs; others use ai_agent_jobs.
    const FACTORY_JOB_TYPES = ["lessonkit_build", "material_ingest", "material_analyze", "standards_ingest", "standards_map", "standards_export"];
    const isFactoryJob = FACTORY_JOB_TYPES.includes(body.jobType);

    if (body.jobType !== "ai_course_generate" && !isFactoryJob) {
      return json({ ok: false, error: { code: "invalid_request", message: `Unsupported jobType: ${body.jobType}` }, httpStatus: 400, requestId }, 200);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FACTORY JOBS (lessonkit_build, material_ingest, material_analyze, etc.)
    // ─────────────────────────────────────────────────────────────────────────
    if (isFactoryJob) {
      // Optional idempotency
      const idempotencyKeyRaw = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
      const idempotencyKey = typeof idempotencyKeyRaw === "string" ? idempotencyKeyRaw.trim() : "";
      const stableJobId = idempotencyKey ? await deterministicJobIdFromKey(idempotencyKey) : null;

      const insertRow: Record<string, unknown> = {
        job_type: body.jobType,
        payload: payload,
        organization_id: organizationId,
        status: "queued",
      };
      if (stableJobId) {
        insertRow.id = stableJobId;
      }

      const inserted = await adminSupabase
        .from("ai_agent_jobs")
        .insert(insertRow)
        .select("id")
        .single();

      if (inserted.error || !inserted.data?.id) {
        if (stableJobId && inserted.error && isDuplicateKeyError(inserted.error)) {
          console.log(`[enqueue-job] Idempotent replay for factory job ${stableJobId} (${requestId})`);
          return json({
            ok: true,
            jobId: stableJobId,
            status: "queued",
            message: "Job already queued (idempotent replay). Poll /get-job to track status.",
            requestId,
          }, 200);
        }
        return json({ ok: false, error: { code: "internal_error", message: inserted.error?.message || "Failed to enqueue factory job" }, httpStatus: 500, requestId }, 200);
      }

      const jobId = (stableJobId ?? (inserted.data.id as string)) as string;
      console.log(`[enqueue-job] Factory job ${jobId} queued: ${body.jobType} (${requestId})`);

      return json({
        ok: true,
        jobId,
        status: "queued",
        message: "Job queued for processing. Poll /get-job to track status.",
        requestId,
      }, 200);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AI_COURSE_GENERATE (legacy path using ai_course_jobs)
    // ─────────────────────────────────────────────────────────────────────────

    // Derive required fields from payload (accept a couple legacy key names)
    const courseId =
      (typeof (payload as any).course_id === "string" && (payload as any).course_id) ||
      (typeof (payload as any).courseId === "string" && (payload as any).courseId) ||
      null;
    const subject =
      (typeof (payload as any).subject === "string" && (payload as any).subject) || null;
    const gradeBand =
      (typeof (payload as any).grade_band === "string" && (payload as any).grade_band) ||
      (typeof (payload as any).gradeBand === "string" && (payload as any).gradeBand) ||
      (typeof (payload as any).grade === "string" && (payload as any).grade) ||
      null;
    const mode =
      (payload as any).mode === "numeric"
        ? "numeric"
        : (payload as any).mode === "options"
          ? "options"
          : null;
    const itemsPerGroup =
      typeof (payload as any).items_per_group === "number"
        ? (payload as any).items_per_group
        : typeof (payload as any).itemsPerGroup === "number"
          ? (payload as any).itemsPerGroup
          : null;
    const notes =
      typeof (payload as any).notes === "string" ? String((payload as any).notes).trim() : "";
    const studyText =
      (typeof (payload as any).study_text === "string" && String((payload as any).study_text).trim()) ||
      (typeof (payload as any).studyText === "string" && String((payload as any).studyText).trim()) ||
      "";

    if (!courseId) {
      return json({ ok: false, error: { code: "invalid_request", message: "course_id is required in payload" }, httpStatus: 400, requestId }, 200);
    }
    if (!subject) {
      return json({ ok: false, error: { code: "invalid_request", message: "subject is required in payload" }, httpStatus: 400, requestId }, 200);
    }
    if (!gradeBand) {
      return json({ ok: false, error: { code: "invalid_request", message: "grade_band (or grade) is required in payload" }, httpStatus: 400, requestId }, 200);
    }
    if (!mode) {
      return json({ ok: false, error: { code: "invalid_request", message: "mode is required in payload (options|numeric)" }, httpStatus: 400, requestId }, 200);
    }

    // Optional idempotency: client can send Idempotency-Key to allow safe retries.
    const idempotencyKeyRaw = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
    const idempotencyKey = typeof idempotencyKeyRaw === "string" ? idempotencyKeyRaw.trim() : "";
    const stableJobId = idempotencyKey ? await deterministicJobIdFromKey(idempotencyKey) : null;

    // Insert using canonical base columns only.
    // IMPORTANT: do NOT include recently-added columns (e.g. organization_id) because PostgREST schema cache
    // may not be refreshed in production immediately after migrations seen by some clients.
    const insertRow: Record<string, unknown> = {
      course_id: courseId,
      subject,
      grade_band: gradeBand,
      grade: typeof (payload as any).grade === "string" ? (payload as any).grade : null,
      items_per_group: itemsPerGroup ?? 12,
      mode,
      status: "pending",
      // Preview/dev-agent mode may provide a synthetic x-user-id that is NOT a real auth.users row.
      // Some deployments enforce an FK on ai_course_jobs.created_by → auth.users(id).
      // In agent-token mode, do NOT write created_by to avoid FK violations; use NULL.
      created_by: auth.type === "agent" ? null : (auth.userId ?? null),
    };
    if (stableJobId) {
      // Base column: "id" is safe to include (avoid adding new columns to dodge schema-cache drift).
      insertRow.id = stableJobId;
    }

    const inserted = await adminSupabase
      .from("ai_course_jobs")
      .insert(insertRow)
      .select("id")
      .single();

    if (inserted.error || !inserted.data?.id) {
      if (stableJobId && inserted.error && isDuplicateKeyError(inserted.error)) {
        // Idempotent replay: job already exists, return the stable id.
        console.log(`[enqueue-job] Idempotent replay for job ${stableJobId} (${requestId})`);
        return json({
          ok: true,
          jobId: stableJobId,
          status: "queued",
          message: "Job already queued (idempotent replay). Poll /list-course-jobs to track status.",
          requestId,
        }, 200);
      }

      return json({ ok: false, error: { code: "internal_error", message: inserted.error?.message || "Failed to enqueue job" }, httpStatus: 500, requestId }, 200);
    }

    const jobId = (stableJobId ?? (inserted.data.id as string)) as string;

    // Extract protocol from payload
    const protocol =
      typeof (payload as any).protocol === "string" ? String((payload as any).protocol).trim() : null;

    // Persist special requests (notes), protocol selection, and optional studyText alongside the job in Storage (no DB schema changes required).
    // This enables generate-course to honor the user's requests even when the worker only has jobId,
    // and works even if `job_events` is not deployed / not in PostgREST schema cache.
    // Always persist if either notes or protocol is provided (protocol alone is valid)
    if (notes || protocol || studyText) {
      try {
        const path = `debug/jobs/${jobId}/special_requests.json`;
        const storagePayload: Record<string, unknown> = {
          jobId,
          requestId,
          createdAt: new Date().toISOString(),
        };
        if (notes) {
          storagePayload.notes = notes;
        }
        if (studyText) {
          storagePayload.studyText = studyText;
        }
        if (protocol) {
          storagePayload.protocol = protocol;
        }
        const blob = new Blob([JSON.stringify(storagePayload, null, 2)], { type: "application/json" });
        const { error: upErr } = await adminSupabase.storage
          .from("courses")
          .upload(path, blob, { upsert: true, contentType: "application/json" });
        if (upErr) {
          throw new Error(`Storage upload failed: ${upErr.message ?? String(upErr)}`);
        }
      } catch (e) {
        // Fail loud: if the user provided notes/protocol but we couldn't persist them, generation would silently ignore them.
        const msg = e instanceof Error ? e.message : String(e);
        await adminSupabase
          .from("ai_course_jobs")
          .update({ status: "failed", error: `Failed to persist special requests: ${msg}`, completed_at: new Date().toISOString() })
          .eq("id", jobId);
        return json({ ok: false, jobId, status: "failed", error: `Failed to persist special requests: ${msg}`, requestId }, 200);
      }
    }

    // For short jobs, we can optionally run them inline.
    // Use runSync=true in body to force sync execution.
    const SHORT_RUNNING_JOBS = ["smoke-test", "marketing"];
    const runInline = body.runSync === true || SHORT_RUNNING_JOBS.includes(body.jobType);

    if (runInline) {
      await adminSupabase
        .from("ai_course_jobs")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", jobId);

      try {
        // IMPORTANT:
        // Even in "runSync" mode, course generation MUST use the canonical generate-course pipeline
        // so course artifacts are persisted (storage + course_metadata) and observable via job progress.
        const genUrl = `${SUPABASE_URL}/functions/v1/generate-course?jobId=${encodeURIComponent(jobId)}`;
        const genResp = await fetch(genUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            gradeBand,
            grade: typeof (payload as any).grade === "string" ? (payload as any).grade : null,
            itemsPerGroup: itemsPerGroup ?? 12,
            levelsCount: typeof (payload as any).levels_count === "number" ? (payload as any).levels_count : undefined,
            mode,
            notes: notes || undefined,
          }),
        });
        const genJson = await genResp.json().catch(() => null);
        if (!genResp.ok || genJson?.success === false) {
          const msg = genJson?.error?.message || genJson?.error || `generate-course failed (${genResp.status})`;
          await adminSupabase
            .from("ai_course_jobs")
            .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
            .eq("id", jobId);
          return json({ ok: false, jobId, status: "failed", error: msg, requestId }, 200);
        }

        const resultPath =
          typeof genJson?.result_path === "string"
            ? genJson.result_path
            : (courseId ? `${courseId}/course.json` : null);
        const update: Record<string, unknown> = { status: "done", completed_at: new Date().toISOString() };
        if (resultPath) update.result_path = resultPath;
        await adminSupabase.from("ai_course_jobs").update(update).eq("id", jobId);

        return new Response(JSON.stringify({ ok: true, jobId, status: "completed", result: genJson, requestId }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await adminSupabase
          .from("ai_course_jobs")
          .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
          .eq("id", jobId);

        return json({ ok: false, jobId, status: "failed", error: message, requestId }, 200);
      }
    }

    // For long-running jobs like ai_course_generate, return immediately.
    console.log(`[enqueue-job] Job ${jobId} queued for async processing: ${body.jobType} (${requestId})`);

    return new Response(
      JSON.stringify({
        ok: true,
        jobId,
        status: "queued",
        message: "Job queued for processing. Poll /list-course-jobs to track status.",
        requestId,
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[enqueue-job] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});
