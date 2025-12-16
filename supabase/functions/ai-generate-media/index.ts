import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { getDefaultProvider, getProvider, UpstreamProviderError } from "../_shared/media-providers.ts";

// Minimal Deno shim for local TypeScript tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(key: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type GenerateMediaBody = {
  prompt: string;
  kind: "image" | "audio";
  providerId?: string;
  options?: Record<string, unknown>;
};

function json(req: Request, body: unknown, status = 200, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: stdHeaders(req, {
      "Content-Type": "application/json",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    }),
  });
}

async function uploadToMediaLibrary(bytes: Uint8Array, contentType: string) {
  const id = crypto.randomUUID();
  const ext =
    contentType.includes("webp") ? "webp" :
    contentType.includes("png") ? "png" :
    contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" :
    "bin";
  const tempPath = `tmp/ai-generated/${id}.${ext}`;
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: contentType });

  const { error: upErr } = await adminSupabase.storage.from("media-library").upload(tempPath, blob, {
    upsert: true,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { data } = adminSupabase.storage.from("media-library").getPublicUrl(tempPath);
  return { id, tempPath, publicUrl: data.publicUrl };
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    // Avoid non-200s in preview hosts that can blank-screen; still fail loudly via ok:false.
    return json(req, { ok: false, error: { code: "method_not_allowed", message: "Method Not Allowed" }, requestId }, 200, requestId);
  }

  // Auth: agent token OR user session
  try {
    await authenticateRequest(req);
  } catch {
    // Avoid non-200s in preview hosts that can blank-screen; still fail loudly via ok:false.
    return json(req, { ok: false, error: { code: "unauthorized", message: "Unauthorized" }, requestId }, 200, requestId);
  }

  let body: GenerateMediaBody;
  try {
    body = (await req.json()) as GenerateMediaBody;
  } catch {
    return json(req, { ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, requestId }, 200, requestId);
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const kind = body?.kind === "image" || body?.kind === "audio" ? body.kind : null;
  if (!prompt) {
    return json(req, { ok: false, error: { code: "invalid_request", message: "prompt is required" }, requestId }, 200, requestId);
  }
  if (!kind) {
    return json(req, { ok: false, error: { code: "invalid_request", message: "kind is required (image|audio)" }, requestId }, 200, requestId);
  }

  // Current UI uses only image. Audio is not yet supported end-to-end (provider returns blob URLs).
  if (kind !== "image") {
    return json(req, { ok: false, error: { code: "invalid_request", message: "Only kind=image is currently supported" }, requestId }, 200, requestId);
  }

  const provider =
    (typeof body.providerId === "string" && body.providerId.trim() ? getProvider(body.providerId.trim()) : null) ||
    getDefaultProvider("image");
  if (!provider || !provider.enabled) {
    return json(
      req,
      { ok: false, error: { code: "provider_unavailable", message: `No enabled provider for media type: ${kind}` }, requestId },
      200,
      requestId
    );
  }

  try {
    const result = await provider.generate({
      mediaType: "image",
      prompt,
      options: body.options ?? {},
    });

    // Fetch the generated image bytes and upload to Supabase Storage for stable URLs.
    const imgResp = await fetch(result.url);
    if (!imgResp.ok) {
      return json(
        req,
        { ok: false, error: { code: "upstream_fetch_failed", message: `Failed to fetch generated image: ${imgResp.status} ${imgResp.statusText}` }, requestId },
        200,
        requestId
      );
    }
    const contentType = imgResp.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await imgResp.arrayBuffer());

    const uploaded = await uploadToMediaLibrary(bytes, contentType);
    const dims = (result.metadata as any)?.dimensions as { width?: number; height?: number } | undefined;

    // IMPORTANT: return the shape expected by src/lib/api/aiRewrites.ts (GeneratedMedia)
    return json(req, {
      id: uploaded.id,
      url: uploaded.publicUrl,
      mimeType: String((result.metadata as any)?.mime_type || contentType),
      width: typeof dims?.width === "number" ? dims.width : undefined,
      height: typeof dims?.height === "number" ? dims.height : undefined,
      alt: `AI generated image (${provider.name})`,
      provider: provider.id,
      tempPath: uploaded.tempPath,
      metadata: result.metadata,
      requestId,
    }, 200, requestId);
  } catch (e) {
    if (e instanceof UpstreamProviderError) {
      const code = e.retryable ? "upstream_unavailable" : "upstream_error";
      // Avoid non-200s in preview hosts that can blank-screen; still fail loudly via ok:false.
      return json(
        req,
        {
          ok: false,
          error: {
            code,
            message: e.message,
            provider: e.providerId,
            retryable: e.retryable,
            upstreamStatus: e.status || undefined,
          },
          requestId,
        },
        200,
        requestId
      );
    }

    const msg = e instanceof Error ? e.message : String(e);
    // Avoid non-200s in preview hosts that can blank-screen; still fail loudly via ok:false.
    return json(req, { ok: false, error: { code: "internal_error", message: msg }, requestId }, 200, requestId);
  }
});

