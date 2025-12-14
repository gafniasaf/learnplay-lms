import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function formatUnknownError(err: unknown): { message: string; details?: unknown } {
  if (err instanceof Error) return { message: err.message };
  if (err && typeof err === "object") {
    const anyErr = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const msg =
      typeof anyErr.message === "string"
        ? anyErr.message
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
    const code = typeof anyErr.code === "string" ? anyErr.code : undefined;
    const hint = typeof anyErr.hint === "string" ? anyErr.hint : undefined;
    const details = anyErr.details;
    const full = [msg, code ? `code=${code}` : null, hint ? `hint=${hint}` : null].filter(Boolean).join(" | ");
    return { message: full, details };
  }
  return { message: String(err) };
}

function isTransientNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("network connection lost") ||
    m.includes("connection lost") ||
    m.includes("connection reset") ||
    m.includes("connection error") ||
    m.includes("error sending request") ||
    m.includes("sendrequest") ||
    m.includes("gateway error")
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function selectSingleJob(jobId: string) {
  // Retry a couple times for transient upstream network failures between Edge and PostgREST.
  // These should not blank-screen the app in Lovable; callers can retry/poll.
  const maxAttempts = 3;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data: job, error: jobError } = await supabase
        .from("ai_course_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (jobError) throw jobError;
      return { job, error: null as unknown };
    } catch (e) {
      lastErr = e;
      const { message } = formatUnknownError(e);
      const transient = isTransientNetworkError(message);
      if (!transient || attempt === maxAttempts - 1) break;
      const backoff = 250 * Math.pow(2, attempt); // 250ms, 500ms
      await sleep(backoff);
    }
  }

  return { job: null as any, error: lastErr };
}

serve(
  withCors(async (req: Request): Promise<Response | Record<string, unknown>> => {
    const requestId = crypto.randomUUID();

    if (req.method !== "GET") {
      return Errors.methodNotAllowed(req.method, requestId, req);
    }

  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("id") || url.searchParams.get("jobId");
    const includeEvents = url.searchParams.get("includeEvents") === "true";

    if (!jobId) {
      return Errors.invalidRequest("Job ID is required", requestId, req);
    }

    // Get the job (with transient retry)
    const { job, error: jobError } = await selectSingleJob(jobId);

    if (jobError) {
      const anyErr = jobError as any;
      if (anyErr?.code === "PGRST116") {
        return Errors.notFound("Job", requestId, req);
      }
      const { message } = formatUnknownError(jobError);
      if (isTransientNetworkError(message)) {
        // Do NOT return 500 here; Lovable treats it as a runtime error / blank screen.
        // Return a retryable payload that UIs can handle and continue polling.
        return {
          ok: false,
          error: { code: "transient_network", message },
          retryAfterMs: 1500,
          requestId,
        };
      }
      throw jobError;
    }

    let events: any[] = [];
    if (includeEvents) {
      // Try to get events if the table exists
      try {
        const { data: eventData, error: eventError } = await supabase
          .from("job_events")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: true });

        if (!eventError && eventData) {
          events = eventData;
        }
      } catch (e) {
        // Best-effort only; ignore transient failures in events.
        const { message } = formatUnknownError(e);
        console.warn("[get-course-job] events query failed (ignored)", { requestId, message });
      }
    }

    return { ok: true, job, events, requestId };
  } catch (err) {
    const { message, details } = formatUnknownError(err);
    console.error("[get-course-job] Error:", { requestId, message, details });
    return Errors.internal(message, requestId, req);
  }
  }),
);

