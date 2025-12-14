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

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from("ai_course_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError) {
      if (jobError.code === "PGRST116") {
        return Errors.notFound("Job", requestId, req);
      }
      throw jobError;
    }

    let events: any[] = [];
    if (includeEvents) {
      // Try to get events if the table exists
      const { data: eventData, error: eventError } = await supabase
        .from("job_events")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      if (!eventError && eventData) {
        events = eventData;
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

