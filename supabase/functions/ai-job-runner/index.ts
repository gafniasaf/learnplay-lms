import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, stdHeaders } from "../_shared/cors.ts";
import { runJob } from "./runner.ts";

interface JobRequestBody {
  jobType?: string;
  payload?: Record<string, unknown>;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "ai-job-runner");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  let body: JobRequestBody;
  try {
    body = await req.json() as JobRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.jobType || typeof body.jobType !== "string") {
    return new Response(JSON.stringify({ error: "jobType is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const result = await runJob(body.jobType, body.payload ?? {});
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

