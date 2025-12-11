// supabase/functions/save-course/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { upsertCourseMetadata } from "../_shared/metadata.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}
if (!AGENT_TOKEN) {
  throw new Error("AGENT_TOKEN is required");
}

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("X-Agent-Token") || "";
  return header && header === AGENT_TOKEN;
}

const EnvelopeSchema = z.object({
  id: z.string().min(1),
  format: z.string().min(1).default("practice"),
  version: z.union([z.string(), z.number()]).optional(),
  content: z.record(z.any()),
});

const RawCourseSchema = z.object({
  id: z.string().min(1),
}).passthrough();

Deno.serve(withCors(async (req: Request) => {
  const reqId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return Errors.methodNotAllowed(req.method, reqId, req) as any;
  }

  if (!isAuthorized(req)) {
    return Errors.invalidAuth(reqId, req) as any;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();

    // Accept envelope or raw course
    let envelope: z.infer<typeof EnvelopeSchema>;
    if (body && typeof body === "object" && "content" in body && "format" in body) {
      envelope = EnvelopeSchema.parse(body);
    } else {
      const raw = RawCourseSchema.parse(body);
      envelope = {
        id: raw.id,
        format: "practice",
        version: 1,
        content: body,
      };
    }

    const path = `${envelope.id}/course.json`;
    const jsonText = JSON.stringify(envelope, null, 2);
    const blob = new Blob([jsonText], { type: "application/json" });

    const { error: uploadError } = await supabase
      .storage
      .from("courses")
      .upload(path, blob, { upsert: true, contentType: "application/json" });

    if (uploadError) {
      return Errors.internal(`Upload failed: ${uploadError.message}`, reqId, req) as any;
    }

    // Update metadata and broadcast catalog update
    await upsertCourseMetadata(supabase as any, envelope.id, envelope);

    return new Response(JSON.stringify({ ok: true, id: envelope.id, path }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return Errors.invalidRequest(message, reqId, req) as any;
  }
}));


