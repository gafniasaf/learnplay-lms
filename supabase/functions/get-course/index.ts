import { idStr } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { withCors } from "../_shared/cors.ts";

Deno.serve(withCors(async (req) => {
  const reqId = crypto.randomUUID();
  
  if (req.method !== "GET" && req.method !== "HEAD") {
    return Errors.methodNotAllowed(req.method, reqId, req);
  }

  const bad = checkOrigin(req);
  if (bad) return bad;

  const rl = rateLimit(req);
  if (rl) return rl;

  try {
    console.log("[get-course] Request received");
    
    // Parse and validate courseId from query params
    const url = new URL(req.url);
    const courseId = url.searchParams.get("courseId");
    
    const idValidation = idStr.safeParse(courseId);
    if (!idValidation.success) {
      console.error("[get-course] Invalid courseId", idValidation.error);
      return Errors.invalidRequest(
        "Invalid courseId format. Must be alphanumeric with dashes, 1-64 characters",
        reqId,
        req
      );
    }

    const validCourseId = idValidation.data;
    console.log(`[get-course] Fetching course: ${validCourseId}`);

    // Check If-None-Match header for conditional request
    const ifNoneMatch = req.headers.get("If-None-Match");

    // Download course.json from storage (prefer service-role if available; fallback to public path)
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const bucket = "courses";
    const objectPath = `${validCourseId}/course.json`;

    if (!baseUrl) {
      throw new Error("SUPABASE_URL is required");
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let storageUrl = "";
    let headers: Record<string, string> = {};

    if (serviceKey && serviceKey.length > 0) {
      // Direct object fetch with service role auth (works for private buckets; bucket may remain private)
      storageUrl = `${baseUrl}/storage/v1/object/${bucket}/${objectPath}`;
      headers["Authorization"] = `Bearer ${serviceKey}`;
    } else {
      // Fallback to public bucket path
      storageUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
    }

    const fileResp = await fetch(storageUrl, { headers });
    if (!fileResp.ok) {
      console.error(
        `[get-course] Storage fetch failed for ${objectPath}: ${fileResp.status} ${fileResp.statusText}`,
      );
      return Errors.notFound("Course", reqId, req);
    }

    const text = await fileResp.text();
    const json = JSON.parse(text);

    // Generate weak ETag from content hash
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const etag = `W/"${hashArray.map(b => b.toString(16).padStart(2, "0")).join("")}"`;
    
    // Build cache headers only; CORS headers are injected by withCors
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      "ETag": etag,
      "Age": "0",
      "X-Request-Id": reqId,
      "Content-Type": "application/json",
    };
    
    // Support 304 Not Modified
    if (ifNoneMatch === etag) {
      console.log(`[get-course] ETag match for ${validCourseId}, returning 304`);
      return new Response(null, {
        headers: cacheHeaders,
        status: 304,
      });
    }
    
    // HEAD request: return headers only
    if (req.method === "HEAD") {
      console.log(`[get-course] HEAD request for ${validCourseId}`);
      return new Response(null, {
        headers: cacheHeaders,
        status: 200,
      });
    }
    
    console.log(`[get-course] ✓ Successfully loaded course: ${validCourseId}`);

    return new Response(JSON.stringify(json), {
      headers: cacheHeaders,
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Errors.internal(message, reqId, req);
  }
}));


