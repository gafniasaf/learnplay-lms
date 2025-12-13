import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runJob } from "../ai-job-runner/runner.ts";
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
      return new Response(
        JSON.stringify({ error: message, requestId }),
        {
          status: message === "Missing organization_id" ? 400 : 401,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        },
      );
    }

    let body: EnqueueBody;
    try {
      body = await req.json() as EnqueueBody;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body", requestId }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

    if (!body?.jobType || typeof body.jobType !== "string") {
      return new Response(JSON.stringify({ error: "jobType is required", requestId }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

    const payload = body.payload ?? {};
    // For now, we only validate org presence (even if this function doesn't yet filter by it).
    // This keeps the system consistent with hybrid auth expectations.
    requireOrganizationId(auth);

    // We currently support the primary factory job used by the UI: ai_course_generate.
    // (Other job types have dedicated endpoints.)
    if (body.jobType !== "ai_course_generate") {
      return new Response(JSON.stringify({ error: `Unsupported jobType: ${body.jobType}`, requestId }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

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

    if (!courseId) {
      return new Response(JSON.stringify({ error: "course_id is required in payload", requestId }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }
    if (!subject) {
      return new Response(JSON.stringify({ error: "subject is required in payload", requestId }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }
    if (!gradeBand) {
      return new Response(JSON.stringify({ error: "grade_band (or grade) is required in payload", requestId }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }
    if (!mode) {
      return new Response(JSON.stringify({ error: "mode is required in payload (options|numeric)", requestId }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
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
      created_by: auth.userId ?? null,
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
        return new Response(
          JSON.stringify({
            ok: true,
            jobId: stableJobId,
            status: "queued",
            message: "Job already queued (idempotent replay). Poll /list-course-jobs to track status.",
            requestId,
          }),
          { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }) },
        );
      }

      return new Response(
        JSON.stringify({ error: inserted.error?.message || "Failed to enqueue job", requestId }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }) },
      );
    }

    const jobId = (stableJobId ?? (inserted.data.id as string)) as string;

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
        const result = await runJob(body.jobType, payload, jobId);
        await adminSupabase
          .from("ai_course_jobs")
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("id", jobId);

        return new Response(JSON.stringify({ ok: true, jobId, status: "completed", result, requestId }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await adminSupabase
          .from("ai_course_jobs")
          .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
          .eq("id", jobId);

        return new Response(JSON.stringify({ ok: false, jobId, status: "failed", error: message, requestId }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
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
    return new Response(JSON.stringify({ error: message, requestId }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }
});
