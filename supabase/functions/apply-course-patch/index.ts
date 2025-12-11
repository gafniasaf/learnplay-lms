import { createClient } from "npm:@supabase/supabase-js@2";
import { applyPatch, validate } from "https://esm.sh/fast-json-patch@3.1.1";
import { rateLimit } from "../_shared/rateLimit.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { logInfo, logError } from "../_shared/log.ts";
import { createRequestContext } from "../_shared/requestContext.ts";
import { Errors } from "../_shared/error.ts";
import { withCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

interface ApplyPatchRequest {
  courseId: string;
  patch: any[];
  description?: string;
}

/**
 * Validate course against Course v2 schema (basic checks)
 */
function validateCourse(course: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!course.id) errors.push("Missing course.id");
  if (!course.title) errors.push("Missing course.title");
  if (!Array.isArray(course.groups) || course.groups.length === 0) {
    errors.push("Missing or empty course.groups");
  }
  if (!Array.isArray(course.levels) || course.levels.length === 0) {
    errors.push("Missing or empty course.levels");
  }
  if (!Array.isArray(course.items) || course.items.length === 0) {
    errors.push("Missing or empty course.items");
  }

  // Validate items
  if (Array.isArray(course.items)) {
    course.items.forEach((item: any, idx: number) => {
      if (typeof item.id !== "number") errors.push(`items[${idx}].id must be number`);
      if (!item.text) errors.push(`items[${idx}].text is required`);
      if (!item.mode) errors.push(`items[${idx}].mode is required`);
      
      // Check placeholder count
      const placeholders = (item.text.match(/_/g) || []).length + 
                          (item.text.match(/\[blank\]/g) || []).length;
      if (placeholders !== 1) {
        errors.push(`items[${idx}].text must have exactly 1 placeholder`);
      }

      // Mode-specific validation
      if (item.mode === "options") {
        if (!Array.isArray(item.options) || item.options.length < 3 || item.options.length > 4) {
          errors.push(`items[${idx}] options mode requires 3-4 options`);
        }
        if (typeof item.correctIndex !== "number" || item.correctIndex < 0) {
          errors.push(`items[${idx}] options mode requires valid correctIndex`);
        }
      } else if (item.mode === "numeric") {
        if (typeof item.answer !== "number") {
          errors.push(`items[${idx}] numeric mode requires answer`);
        }
        if (item.options !== undefined) {
          errors.push(`items[${idx}] numeric mode should not have options`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

Deno.serve(withCors(async (req) => {
  const ctx = createRequestContext(req, "apply-course-patch");
  
  // Rate limiting
  const rateLimitResp = rateLimit(req);
  if (rateLimitResp) return rateLimitResp;

  // Origin check
  const originResp = checkOrigin(req);
  if (originResp) return originResp;

  try {
    if (req.method !== "POST") return Errors.methodNotAllowed("POST", ctx.requestId, req);

    // Validate request body FIRST
    let body: ApplyPatchRequest;
    try {
      body = await req.json();
    } catch (err) {
      return Errors.invalidRequest("Invalid JSON body", ctx.requestId, req);
    }

    if (!body.courseId || !Array.isArray(body.patch)) {
      return Errors.invalidRequest("Missing courseId or patch array", ctx.requestId, req);
    }

    if (typeof body.courseId !== "string" || !body.courseId.trim()) {
      return Errors.invalidRequest("courseId must be a non-empty string", ctx.requestId, req);
    }

    logInfo("apply-course-patch request", { ...ctx, courseId: body.courseId });

    // Initialize Supabase AFTER validation (service role - no user auth)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download current course
    logInfo("Downloading current course", { ...ctx, courseId: body.courseId });
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("courses")
      .download(`${body.courseId}/course.json`);

    if (downloadError || !fileData) {
      await logError("Failed to download course", downloadError || new Error("No data"), ctx);
      return Errors.notFound("Course", ctx.requestId, req);
    }

    const courseText = await fileData.text();
    const currentCourse = JSON.parse(courseText);

    // Validate patch
    const patchErrors = validate(body.patch, currentCourse);
    if (patchErrors) {
      return Errors.invalidRequest(`Invalid patch: ${JSON.stringify(patchErrors)}`, ctx.requestId, req);
    }

    // Apply patch
    const patchResult = applyPatch(currentCourse, body.patch, true);
    const patchedCourse = patchResult.newDocument;

    // Validate patched course
    const validation = validateCourse(patchedCourse);
    if (!validation.valid) {
      return Errors.invalidRequest(`Invalid patched course: ${validation.errors.join(", ")}`, ctx.requestId, req);
    }

    // Create version timestamp
    const timestamp = Date.now();
    const versionPath = `${body.courseId}/versions/${timestamp}.json`;

    // Upload versioned course
    logInfo("Uploading versioned course", { ...ctx, versionPath });
    
    const { error: versionError } = await supabase.storage
      .from("courses")
      .upload(versionPath, new Blob([JSON.stringify(patchedCourse, null, 2)], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false
      });

    if (versionError) {
      await logError("Failed to upload version", versionError, ctx);
      return Errors.internal(`Failed to upload version: ${versionError.message}`, ctx.requestId, req);
    }

    // Update latest course
    logInfo("Updating latest course", ctx);
    
    const { error: updateError } = await supabase.storage
      .from("courses")
      .upload(`${body.courseId}/course.json`, new Blob([JSON.stringify(patchedCourse, null, 2)], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true
      });

    if (updateError) {
      await logError("Failed to update latest", updateError, ctx);
      return Errors.internal(`Failed to update latest: ${updateError.message}`, ctx.requestId, req);
    }

    // Update catalog.version
    const catalogVersion = {
      etag: crypto.randomUUID(),
      timestamp,
      lastModified: new Date().toISOString(),
      description: body.description || "Applied patch"
    };

    await supabase.storage
      .from("courses")
      .upload("catalog.version", new Blob([JSON.stringify(catalogVersion, null, 2)], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true
      });

    // Notify clients to refresh course content/caches
    try {
      await supabase.from('catalog_updates').insert({
        course_id: body.courseId,
        action: 'updated',
        catalog_version: catalogVersion.etag || timestamp,
        course_title: patchedCourse?.title || body.courseId,
      });
    } catch (e) {
      await logError('Failed to insert catalog_updates row', e, ctx);
    }

    logInfo("Patch applied successfully", { 
      ...ctx, 
      versionPath,
      patchOps: body.patch.length
    });

    return {
      success: true,
      versionPath,
      timestamp,
      patchedCourse,
      appliedOps: body.patch.length
    };

  } catch (err) {
    await logError("Unexpected error", err, ctx);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return Errors.internal(errorMessage, ctx.requestId, req);
  }
}));


