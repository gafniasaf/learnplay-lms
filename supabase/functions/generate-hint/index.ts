import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

interface HintBody {
  courseId: string;
  itemId: number;
  hint?: string;
}

Deno.serve(withCors(async (req: Request) => {
  const reqId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return Errors.methodNotAllowed(req.method, reqId, req) as any;
  }

  try {
    const body = (await req.json()) as Partial<HintBody>;
    const courseId = body.courseId || "";
    const itemId = typeof body.itemId === "number" ? body.itemId : NaN;
    if (!courseId || Number.isNaN(itemId)) {
      return Errors.invalidRequest("Missing courseId or itemId", reqId, req) as any;
    }

    // Compose a simple, generic hint if not provided
    const hintText = (body.hint && String(body.hint).trim()) || "Consider the key concept in the stem. What is the relationship between the terms mentioned?";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download existing course.json (envelope)
    const path = `${courseId}/course.json`;
    const { data: fileData, error: downloadError } = await supabase.storage.from("courses").download(path);
    if (downloadError || !fileData) {
      return Errors.notFound("Course JSON", reqId, req) as any;
    }
    const text = await fileData.text();
    const json = JSON.parse(text);

    const isEnvelope = json && typeof json === "object" && "content" in json && "format" in json;
    const envelope = isEnvelope ? json : { id: courseId, format: "practice", version: 1, content: json };
    const content = envelope.content || {};

    const items: any[] = Array.isArray(content.items) ? content.items : [];
    const target = items.find((it) => Number(it?.id) === itemId);
    if (!target) {
      return Errors.notFound("Item", reqId, req) as any;
    }

    target.hint = hintText;
    envelope.content = { ...content, items };

    // Upload updated envelope
    const updated = JSON.stringify(envelope, null, 2);
    const blob = new Blob([updated], { type: "application/json" });
    const { error: uploadError } = await supabase.storage.from("courses").upload(path, blob, {
      upsert: true,
      contentType: "application/json",
    });
    if (uploadError) {
      return Errors.internal(`Upload failed: ${uploadError.message}`, reqId, req) as any;
    }

    return new Response(JSON.stringify({ ok: true, courseId, itemId, hint: hintText }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return Errors.invalidRequest(message, reqId, req) as any;
  }
}));


