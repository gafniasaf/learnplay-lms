import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface SaveCourseRequest {
  courseId: string;
  content: any;
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }

  try {
    const body = await req.json() as SaveCourseRequest;
    const { courseId, content } = body;

    if (!courseId || !content) {
      return new Response(
        JSON.stringify({ error: "courseId and content are required" }),
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const path = `${courseId}/course.json`;
    const envelope = {
      courseId,
      format: content._metadata?.format ?? "practice",
      version: content._metadata?.envelope?.version ?? "1.0.0",
      content: {
        ...content,
        contentVersion: new Date().toISOString(),
      },
    };

    const courseJson = JSON.stringify(envelope, null, 2);
    const blob = new Blob([courseJson], { type: "application/json" });

    const { error: uploadError } = await supabase.storage
      .from("courses")
      .upload(path, blob, {
        upsert: true,
        contentType: "application/json",
        cacheControl: "public, max-age=60",
      });

    if (uploadError) {
      console.error("[save-course-json] Upload error:", uploadError);
      return new Response(
        JSON.stringify({ ok: false, error: uploadError.message }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, path }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[save-course-json] Error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});


